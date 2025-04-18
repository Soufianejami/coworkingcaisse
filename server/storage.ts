import { 
  InsertProduct, InsertTransaction, InsertDailyStats, InsertUser, InsertExpense,
  InsertInventory, InsertStockMovement,
  Product, Transaction, DailyStats, User, Expense,
  Inventory, StockMovement,
  TransactionType, PaymentMethod, ExpenseCategory, StockActionType,
  products, transactions, dailyStats, users, expenses, inventory, stockMovements
} from "@shared/schema";
import { startOfDay, endOfDay, format, parseISO, addMonths } from "date-fns";
import { db } from "./db";
import { eq, gte, lte, desc, and, asc } from "drizzle-orm";

export interface IStorage {
  // Users
  getAllUsers(): Promise<User[]>;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  
  // Products
  getAllProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<Product>): Promise<Product | undefined>;
  
  // Transactions
  getAllTransactions(limit?: number, offset?: number): Promise<Transaction[]>;
  getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]>;
  getTransactionsByType(type: TransactionType): Promise<Transaction[]>;
  getTransaction(id: number): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  
  // Expenses
  getAllExpenses(): Promise<Expense[]>;
  getExpensesByDateRange(startDate: Date, endDate: Date): Promise<Expense[]>;
  getExpensesByCategory(category: ExpenseCategory): Promise<Expense[]>;
  getExpense(id: number): Promise<Expense | undefined>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  updateExpense(id: number, expense: Partial<Expense>): Promise<Expense | undefined>;
  deleteExpense(id: number): Promise<boolean>;
  
  // Inventory
  getInventoryWithProducts(): Promise<(Inventory & { product: Product })[]>;
  getInventoryItem(id: number): Promise<(Inventory & { product: Product }) | undefined>;
  getInventoryItemByProductId(productId: number): Promise<Inventory | undefined>;
  createInventoryItem(item: InsertInventory): Promise<Inventory>;
  updateInventoryItem(id: number, item: Partial<Inventory>): Promise<Inventory | undefined>;
  getExpiringItems(daysThreshold: number): Promise<(Inventory & { product: Product })[]>;
  getLowStockItems(): Promise<(Inventory & { product: Product })[]>;
  
  // Stock movements
  addStock(productId: number, quantity: number, userId: number, reason?: string): Promise<{ inventory: Inventory, movement: StockMovement }>;
  removeStock(productId: number, quantity: number, userId: number, reason?: string, transactionId?: number): Promise<{ inventory: Inventory, movement: StockMovement }>;
  adjustStock(productId: number, newQuantity: number, userId: number, reason?: string): Promise<{ inventory: Inventory, movement: StockMovement }>;
  getStockMovements(limit?: number, offset?: number): Promise<(StockMovement & { product: Product })[]>;
  getStockMovementsByProduct(productId: number): Promise<(StockMovement & { product: Product })[]>;
  
  // Daily stats
  getDailyStats(date: Date): Promise<DailyStats | undefined>;
  upsertDailyStats(stats: InsertDailyStats): Promise<DailyStats>;
  getDailyStatsByRange(startDate: Date, endDate: Date): Promise<DailyStats[]>;
}

export class DatabaseStorage implements IStorage {
  // Inventory
  async getInventoryWithProducts(): Promise<(Inventory & { product: Product })[]> {
    return await db
      .select({
        id: inventory.id,
        productId: inventory.productId,
        quantity: inventory.quantity,
        minThreshold: inventory.minThreshold,
        purchasePrice: inventory.purchasePrice,
        expirationDate: inventory.expirationDate,
        lastRestockDate: inventory.lastRestockDate,
        createdAt: inventory.createdAt,
        updatedAt: inventory.updatedAt,
        product: products
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .orderBy(asc(products.name));
  }
  
  async getInventoryItem(id: number): Promise<(Inventory & { product: Product }) | undefined> {
    const result = await db
      .select({
        id: inventory.id,
        productId: inventory.productId,
        quantity: inventory.quantity,
        minThreshold: inventory.minThreshold,
        purchasePrice: inventory.purchasePrice,
        expirationDate: inventory.expirationDate,
        lastRestockDate: inventory.lastRestockDate,
        createdAt: inventory.createdAt,
        updatedAt: inventory.updatedAt,
        product: products
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .where(eq(inventory.id, id));
    
    return result.length > 0 ? result[0] : undefined;
  }
  
  async getInventoryItemByProductId(productId: number): Promise<Inventory | undefined> {
    const result = await db
      .select()
      .from(inventory)
      .where(eq(inventory.productId, productId));
    
    return result.length > 0 ? result[0] : undefined;
  }
  
  async createInventoryItem(item: InsertInventory): Promise<Inventory> {
    // Make sure there's only one inventory item per product
    const existingItem = await this.getInventoryItemByProductId(item.productId);
    if (existingItem) {
      throw new Error(`An inventory item for product ID ${item.productId} already exists`);
    }
    
    const result = await db.insert(inventory).values({
      ...item,
      updatedAt: new Date() // Ensure updatedAt is set
    }).returning();
    
    // Si un prix d'achat est défini, créer automatiquement une dépense
    if (item.purchasePrice && item.purchasePrice > 0) {
      try {
        // Récupérer le nom du produit
        const [product] = await db.select().from(products).where(eq(products.id, item.productId));
        
        if (product) {
          // Créer une dépense correspondant à l'achat du stock
          await this.createExpense({
            amount: item.purchasePrice * (item.quantity || 1), // Total du coût = prix unitaire × quantité
            category: "supplies",
            date: new Date(),
            description: `Achat de stock: ${product.name}`,
            paymentMethod: "cash",
            createdById: 1 // Utiliser l'ID 1 (admin) par défaut
          });
        }
      } catch (error) {
        console.error("Erreur lors de la création de la dépense pour le stock:", error);
        // On ne bloque pas la création de l'inventaire si la dépense échoue
      }
    }
    
    return result[0];
  }
  
  async updateInventoryItem(id: number, item: Partial<Inventory>): Promise<Inventory | undefined> {
    const result = await db.update(inventory)
      .set({
        ...item,
        updatedAt: new Date() // Always update the updatedAt timestamp
      })
      .where(eq(inventory.id, id))
      .returning();
    
    return result.length > 0 ? result[0] : undefined;
  }
  
  async getExpiringItems(daysThreshold: number = 7): Promise<(Inventory & { product: Product })[]> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
    
    return await db
      .select({
        id: inventory.id,
        productId: inventory.productId,
        quantity: inventory.quantity,
        minThreshold: inventory.minThreshold,
        purchasePrice: inventory.purchasePrice,
        expirationDate: inventory.expirationDate,
        lastRestockDate: inventory.lastRestockDate,
        createdAt: inventory.createdAt,
        updatedAt: inventory.updatedAt,
        product: products
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .where(and(
        lte(inventory.expirationDate, thresholdDate),
        gte(inventory.expirationDate, new Date()) // Only include items that haven't expired yet
      ))
      .orderBy(asc(inventory.expirationDate));
  }
  
  async getLowStockItems(): Promise<(Inventory & { product: Product })[]> {
    return await db
      .select({
        id: inventory.id,
        productId: inventory.productId,
        quantity: inventory.quantity,
        minThreshold: inventory.minThreshold,
        purchasePrice: inventory.purchasePrice,
        expirationDate: inventory.expirationDate,
        lastRestockDate: inventory.lastRestockDate,
        createdAt: inventory.createdAt,
        updatedAt: inventory.updatedAt,
        product: products
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .where(lte(inventory.quantity, inventory.minThreshold))
      .orderBy(asc(inventory.quantity));
  }
  
  // Stock movements
  async addStock(
    productId: number, 
    quantity: number, 
    userId: number, 
    reason?: string
  ): Promise<{ inventory: Inventory, movement: StockMovement }> {
    if (quantity <= 0) {
      throw new Error("Quantity must be positive when adding stock");
    }
    
    // Get the inventory item or create it if it doesn't exist
    let invItem = await this.getInventoryItemByProductId(productId);
    if (!invItem) {
      invItem = await this.createInventoryItem({
        productId,
        quantity: 0,
        minThreshold: 5,
        lastRestockDate: new Date()
      });
    }
    
    // Update the inventory item
    const updatedInv = await this.updateInventoryItem(invItem.id, {
      quantity: invItem.quantity + quantity,
      lastRestockDate: new Date()
    });
    
    if (!updatedInv) {
      throw new Error(`Failed to update inventory for product ID ${productId}`);
    }
    
    // Record the stock movement
    const movement = await db.insert(stockMovements).values({
      inventoryId: invItem.id,
      productId,
      quantity,
      actionType: "add",
      reason,
      performedById: userId
    }).returning();
    
    // Si le produit a un prix d'achat, créer automatiquement une dépense
    if (invItem.purchasePrice && invItem.purchasePrice > 0) {
      try {
        // Récupérer le nom du produit
        const [product] = await db.select().from(products).where(eq(products.id, productId));
        
        if (product) {
          // Créer une dépense correspondant à l'ajout de stock
          await this.createExpense({
            amount: invItem.purchasePrice * quantity, // Total du coût = prix unitaire × quantité ajoutée
            category: "supplies",
            date: new Date(),
            description: `Achat de stock: ${product.name} (${quantity} unités)`,
            paymentMethod: "cash",
            createdById: userId
          });
        }
      } catch (error) {
        console.error("Erreur lors de la création de la dépense pour l'ajout de stock:", error);
        // On ne bloque pas l'ajout de stock si la dépense échoue
      }
    }
    
    return {
      inventory: updatedInv,
      movement: movement[0]
    };
  }
  
  async removeStock(
    productId: number, 
    quantity: number, 
    userId: number, 
    reason?: string,
    transactionId?: number
  ): Promise<{ inventory: Inventory, movement: StockMovement }> {
    if (quantity <= 0) {
      throw new Error("Quantity must be positive when removing stock");
    }
    
    // Get the inventory item
    const invItem = await this.getInventoryItemByProductId(productId);
    if (!invItem) {
      throw new Error(`No inventory item found for product ID ${productId}`);
    }
    
    // Make sure there's enough stock
    if (invItem.quantity < quantity) {
      throw new Error(`Not enough stock for product ID ${productId}. Available: ${invItem.quantity}, Requested: ${quantity}`);
    }
    
    // Update the inventory item
    const updatedInv = await this.updateInventoryItem(invItem.id, {
      quantity: invItem.quantity - quantity
    });
    
    if (!updatedInv) {
      throw new Error(`Failed to update inventory for product ID ${productId}`);
    }
    
    // Record the stock movement
    const movement = await db.insert(stockMovements).values({
      inventoryId: invItem.id,
      productId,
      quantity: -quantity, // Negative for removal
      actionType: "remove",
      reason,
      performedById: userId,
      transactionId
    }).returning();
    
    return {
      inventory: updatedInv,
      movement: movement[0]
    };
  }
  
  async adjustStock(
    productId: number, 
    newQuantity: number, 
    userId: number, 
    reason?: string
  ): Promise<{ inventory: Inventory, movement: StockMovement }> {
    if (newQuantity < 0) {
      throw new Error("New quantity cannot be negative");
    }
    
    // Get the inventory item or create it if it doesn't exist
    let invItem = await this.getInventoryItemByProductId(productId);
    if (!invItem) {
      invItem = await this.createInventoryItem({
        productId,
        quantity: 0,
        minThreshold: 5,
        lastRestockDate: new Date()
      });
    }
    
    const quantityChange = newQuantity - invItem.quantity;
    
    // Update the inventory item
    const updatedInv = await this.updateInventoryItem(invItem.id, {
      quantity: newQuantity,
      ...(quantityChange > 0 ? { lastRestockDate: new Date() } : {})
    });
    
    if (!updatedInv) {
      throw new Error(`Failed to update inventory for product ID ${productId}`);
    }
    
    // Record the stock movement
    const movement = await db.insert(stockMovements).values({
      inventoryId: invItem.id,
      productId,
      quantity: quantityChange,
      actionType: "adjust",
      reason,
      performedById: userId
    }).returning();
    
    return {
      inventory: updatedInv,
      movement: movement[0]
    };
  }
  
  async getStockMovements(limit?: number, offset = 0): Promise<(StockMovement & { product: Product })[]> {
    const query = db
      .select({
        id: stockMovements.id,
        inventoryId: stockMovements.inventoryId,
        productId: stockMovements.productId,
        quantity: stockMovements.quantity,
        actionType: stockMovements.actionType,
        reason: stockMovements.reason,
        transactionId: stockMovements.transactionId,
        performedById: stockMovements.performedById,
        timestamp: stockMovements.timestamp,
        product: products
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .orderBy(desc(stockMovements.timestamp));
    
    if (limit) {
      query.limit(limit).offset(offset);
    }
    
    return await query;
  }
  
  async getStockMovementsByProduct(productId: number): Promise<(StockMovement & { product: Product })[]> {
    return await db
      .select({
        id: stockMovements.id,
        inventoryId: stockMovements.inventoryId,
        productId: stockMovements.productId,
        quantity: stockMovements.quantity,
        actionType: stockMovements.actionType,
        reason: stockMovements.reason,
        transactionId: stockMovements.transactionId,
        performedById: stockMovements.performedById,
        timestamp: stockMovements.timestamp,
        product: products
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .where(eq(stockMovements.productId, productId))
      .orderBy(desc(stockMovements.timestamp));
  }
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }
  
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result.length > 0 ? result[0] : undefined;
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result.length > 0 ? result[0] : undefined;
  }
  
  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }
  
  async updateUser(id: number, user: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users)
      .set(user)
      .where(eq(users.id, id))
      .returning();
    return result.length > 0 ? result[0] : undefined;
  }
  
  async deleteUser(id: number): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    return result.length > 0;
  }
  
  // Expenses
  async getAllExpenses(): Promise<Expense[]> {
    return await db.select().from(expenses).orderBy(desc(expenses.date));
  }
  
  async getExpensesByDateRange(startDate: Date, endDate: Date): Promise<Expense[]> {
    const start = startOfDay(startDate);
    const end = endOfDay(endDate);
    
    return await db.select()
      .from(expenses)
      .where(and(
        gte(expenses.date, start),
        lte(expenses.date, end)
      ))
      .orderBy(desc(expenses.date));
  }
  
  async getExpensesByCategory(category: ExpenseCategory): Promise<Expense[]> {
    return await db.select()
      .from(expenses)
      .where(eq(expenses.category, category))
      .orderBy(desc(expenses.date));
  }
  
  async getExpense(id: number): Promise<Expense | undefined> {
    const result = await db.select().from(expenses).where(eq(expenses.id, id));
    return result.length > 0 ? result[0] : undefined;
  }
  
  async createExpense(expense: InsertExpense): Promise<Expense> {
    const result = await db.insert(expenses).values(expense).returning();
    return result[0];
  }
  
  async updateExpense(id: number, expense: Partial<Expense>): Promise<Expense | undefined> {
    const result = await db.update(expenses)
      .set(expense)
      .where(eq(expenses.id, id))
      .returning();
    return result.length > 0 ? result[0] : undefined;
  }
  
  async deleteExpense(id: number): Promise<boolean> {
    const result = await db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
    return result.length > 0;
  }
  
  // Products
  async getAllProducts(): Promise<Product[]> {
    return await db.select().from(products);
  }
  
  async getProduct(id: number): Promise<Product | undefined> {
    const result = await db.select().from(products).where(eq(products.id, id));
    return result.length > 0 ? result[0] : undefined;
  }
  
  async createProduct(product: InsertProduct): Promise<Product> {
    const result = await db.insert(products).values(product).returning();
    return result[0];
  }
  
  async updateProduct(id: number, product: Partial<Product>): Promise<Product | undefined> {
    const result = await db.update(products)
      .set(product)
      .where(eq(products.id, id))
      .returning();
    return result.length > 0 ? result[0] : undefined;
  }
  
  // Transactions
  async getAllTransactions(limit?: number, offset = 0): Promise<Transaction[]> {
    const query = db.select()
      .from(transactions)
      .orderBy(desc(transactions.date));
    
    if (limit) {
      query.limit(limit).offset(offset);
    }
    
    return await query;
  }
  
  async getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
    const start = startOfDay(startDate);
    const end = endOfDay(endDate);
    
    return await db.select()
      .from(transactions)
      .where(and(
        gte(transactions.date, start),
        lte(transactions.date, end)
      ))
      .orderBy(desc(transactions.date));
  }
  
  async getTransactionsByType(type: TransactionType): Promise<Transaction[]> {
    return await db.select()
      .from(transactions)
      .where(eq(transactions.type, type))
      .orderBy(desc(transactions.date));
  }
  
  async getTransaction(id: number): Promise<Transaction | undefined> {
    const result = await db.select().from(transactions).where(eq(transactions.id, id));
    return result.length > 0 ? result[0] : undefined;
  }
  
  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    // If it's a subscription, calculate end date if not provided
    if (transaction.type === 'subscription' && !transaction.subscriptionEndDate) {
      transaction.subscriptionEndDate = addMonths(transaction.date || new Date(), 1);
    }
    
    const result = await db.insert(transactions).values(transaction).returning();
    const newTransaction = result[0];
    
    // Update daily stats
    await this.updateStatsForTransaction(newTransaction);
    
    return newTransaction;
  }
  
  async updateTransaction(id: number, data: Partial<Transaction>): Promise<Transaction | undefined> {
    // Get the original transaction first
    const originalTransaction = await this.getTransaction(id);
    if (!originalTransaction) {
      return undefined;
    }
    
    // If changing type to subscription, ensure subscription end date is set
    if (data.type === 'subscription' && !data.subscriptionEndDate) {
      // Use provided date or existing date or current date
      const startDate = data.date || originalTransaction.date || new Date();
      data.subscriptionEndDate = addMonths(startDate, 1);
    }
    
    // Update the transaction
    const result = await db.update(transactions)
      .set(data)
      .where(eq(transactions.id, id))
      .returning();
    
    if (result.length === 0) {
      return undefined;
    }
    
    const updatedTransaction = result[0];
    
    // If the amount, date, or type changed, we need to update stats
    if (
      data.amount !== undefined || 
      data.date !== undefined || 
      data.type !== undefined
    ) {
      // First, remove the impact of the original transaction
      const originalDate = startOfDay(originalTransaction.date);
      let originalStats = await this.getDailyStats(originalDate);
      
      if (originalStats) {
        // Subtract the original transaction values
        originalStats.totalRevenue -= originalTransaction.amount;
        
        switch (originalTransaction.type) {
          case 'entry':
            originalStats.entriesRevenue -= originalTransaction.amount;
            originalStats.entriesCount = Math.max(0, originalStats.entriesCount - 1);
            break;
          case 'subscription':
            originalStats.subscriptionsRevenue -= originalTransaction.amount;
            originalStats.subscriptionsCount = Math.max(0, originalStats.subscriptionsCount - 1);
            break;
          case 'cafe':
            originalStats.cafeRevenue -= originalTransaction.amount;
            originalStats.cafeOrdersCount = Math.max(0, originalStats.cafeOrdersCount - 1);
            break;
        }
        
        // Update the stats for the original date
        await this.upsertDailyStats(originalStats);
      }
      
      // Then, add the impact of the updated transaction
      await this.updateStatsForTransaction(updatedTransaction);
    }
    
    return updatedTransaction;
  }
  
  async deleteTransaction(id: number): Promise<boolean> {
    // Get the transaction first to update stats later
    const transaction = await this.getTransaction(id);
    if (!transaction) {
      return false;
    }
    
    // Delete the transaction
    const result = await db.delete(transactions)
      .where(eq(transactions.id, id))
      .returning({ id: transactions.id });
    
    if (result.length === 0) {
      return false;
    }
    
    // Update stats by removing this transaction's contribution
    const transactionDate = startOfDay(transaction.date);
    let stats = await this.getDailyStats(transactionDate);
    
    if (stats) {
      // Subtract the transaction values
      stats.totalRevenue -= transaction.amount;
      
      switch (transaction.type) {
        case 'entry':
          stats.entriesRevenue -= transaction.amount;
          stats.entriesCount = Math.max(0, stats.entriesCount - 1);
          break;
        case 'subscription':
          stats.subscriptionsRevenue -= transaction.amount;
          stats.subscriptionsCount = Math.max(0, stats.subscriptionsCount - 1);
          break;
        case 'cafe':
          stats.cafeRevenue -= transaction.amount;
          stats.cafeOrdersCount = Math.max(0, stats.cafeOrdersCount - 1);
          break;
      }
      
      // Update the stats
      await this.upsertDailyStats(stats);
    }
    
    return true;
  }
  
  // Daily stats
  async getDailyStats(date: Date): Promise<DailyStats | undefined> {
    const dayStart = startOfDay(date);
    const result = await db.select().from(dailyStats).where(eq(dailyStats.date, dayStart));
    return result.length > 0 ? result[0] : undefined;
  }
  
  async upsertDailyStats(stats: InsertDailyStats): Promise<DailyStats> {
    const dayStart = startOfDay(stats.date);
    
    // Try to find existing stats
    const existingStats = await this.getDailyStats(dayStart);
    
    if (existingStats) {
      // Update existing stats
      const result = await db.update(dailyStats)
        .set({
          totalRevenue: stats.totalRevenue !== undefined ? stats.totalRevenue : existingStats.totalRevenue,
          entriesRevenue: stats.entriesRevenue !== undefined ? stats.entriesRevenue : existingStats.entriesRevenue,
          entriesCount: stats.entriesCount !== undefined ? stats.entriesCount : existingStats.entriesCount,
          subscriptionsRevenue: stats.subscriptionsRevenue !== undefined ? stats.subscriptionsRevenue : existingStats.subscriptionsRevenue,
          subscriptionsCount: stats.subscriptionsCount !== undefined ? stats.subscriptionsCount : existingStats.subscriptionsCount,
          cafeRevenue: stats.cafeRevenue !== undefined ? stats.cafeRevenue : existingStats.cafeRevenue,
          cafeOrdersCount: stats.cafeOrdersCount !== undefined ? stats.cafeOrdersCount : existingStats.cafeOrdersCount
        })
        .where(eq(dailyStats.id, existingStats.id))
        .returning();
      
      return result[0];
    } else {
      // Create new stats
      const statsWithDefaults = {
        date: dayStart,
        totalRevenue: stats.totalRevenue || 0,
        entriesRevenue: stats.entriesRevenue || 0,
        entriesCount: stats.entriesCount || 0,
        subscriptionsRevenue: stats.subscriptionsRevenue || 0,
        subscriptionsCount: stats.subscriptionsCount || 0,
        cafeRevenue: stats.cafeRevenue || 0,
        cafeOrdersCount: stats.cafeOrdersCount || 0
      };
      
      const result = await db.insert(dailyStats).values(statsWithDefaults).returning();
      return result[0];
    }
  }
  
  async getDailyStatsByRange(startDate: Date, endDate: Date): Promise<DailyStats[]> {
    const start = startOfDay(startDate);
    const end = endOfDay(endDate);
    
    return await db.select()
      .from(dailyStats)
      .where(and(
        gte(dailyStats.date, start),
        lte(dailyStats.date, end)
      ))
      .orderBy(asc(dailyStats.date));
  }
  
  // Helper methods
  private async updateStatsForTransaction(transaction: Transaction): Promise<void> {
    const transactionDate = startOfDay(new Date(transaction.date));
    let stats = await this.getDailyStats(transactionDate);
    
    if (!stats) {
      stats = {
        id: 0, // Will be auto-generated by DB
        date: transactionDate,
        totalRevenue: 0,
        entriesRevenue: 0,
        entriesCount: 0,
        subscriptionsRevenue: 0,
        subscriptionsCount: 0,
        cafeRevenue: 0,
        cafeOrdersCount: 0
      };
    }
    
    // Update stats based on transaction type
    stats.totalRevenue += transaction.amount;
    
    switch (transaction.type) {
      case 'entry':
        stats.entriesRevenue += transaction.amount;
        stats.entriesCount += 1;
        break;
      case 'subscription':
        stats.subscriptionsRevenue += transaction.amount;
        stats.subscriptionsCount += 1;
        break;
      case 'cafe':
        stats.cafeRevenue += transaction.amount;
        stats.cafeOrdersCount += 1;
        break;
    }
    
    await this.upsertDailyStats(stats);
  }
  
  // Initialize products if none exist
  async initializeDefaultProductsIfNeeded(): Promise<void> {
    const existingProducts = await this.getAllProducts();
    
    if (existingProducts.length === 0) {
      const defaultProducts: InsertProduct[] = [
        { name: "Café expresso", price: 15, category: "beverage", isActive: true },
        { name: "Café américain", price: 18, category: "beverage", isActive: true },
        { name: "Thé à la menthe", price: 12, category: "beverage", isActive: true },
        { name: "Eau minérale", price: 10, category: "beverage", isActive: true },
        { name: "Jus d'orange", price: 20, category: "beverage", isActive: true }
      ];
      
      for (const product of defaultProducts) {
        await this.createProduct(product);
      }
    }
  }
  
  // Initialize default admin user if no users exist in the database
  async initializeDefaultAdminIfNeeded(hashPasswordFn: (password: string) => Promise<string>): Promise<void> {
    const existingUsers = await this.getAllUsers();
    
    if (existingUsers.length === 0) {
      // Create default admin user
      const defaultAdmin: InsertUser = {
        username: "admin",
        password: await hashPasswordFn("admin"), // Default password is "admin"
        role: "admin",
        fullName: "Administrator",
      };
      
      // Create default super_admin user
      const superAdmin: InsertUser = {
        username: "superadmin",
        password: await hashPasswordFn("superadmin"), // Default password is "superadmin"
        role: "super_admin",
        fullName: "Super Administrator",
      };
      
      await this.createUser(defaultAdmin);
      await this.createUser(superAdmin);
      console.log("Default admin user created with username: admin and password: admin");
      console.log("Default super_admin user created with username: superadmin and password: superadmin");
    }
  }
}

// Create and initialize the database storage
export const storage = new DatabaseStorage();

// Initialize default products (this will run when the server starts)
(async () => {
  try {
    await (storage as DatabaseStorage).initializeDefaultProductsIfNeeded();
    console.log("Storage initialization complete");
  } catch (error) {
    console.error("Error initializing storage:", error);
  }
})();
