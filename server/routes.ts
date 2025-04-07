import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertProductSchema, insertTransactionSchema, insertExpenseSchema, 
  insertUserSchema, USER_ROLES, EXPENSE_CATEGORIES
} from "@shared/schema";
import { format, parseISO, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { setupAuth, requireAdmin, hashPassword } from "./auth";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication
  setupAuth(app);
  
  // Initialize default admin user if needed
  try {
    await (storage as any).initializeDefaultAdminIfNeeded(hashPassword);
  } catch (error) {
    console.error("Error initializing default admin:", error);
  }
  
  // API prefix
  const apiPrefix = "/api";
  
  // Product routes
  app.get(`${apiPrefix}/products`, async (req: Request, res: Response) => {
    try {
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.get(`${apiPrefix}/products/:id`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
      
      const product = await storage.getProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post(`${apiPrefix}/products`, async (req: Request, res: Response) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      const newProduct = await storage.createProduct(productData);
      res.status(201).json(newProduct);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  app.patch(`${apiPrefix}/products/:id`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
      
      const updatedProduct = await storage.updateProduct(id, req.body);
      if (!updatedProduct) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      res.json(updatedProduct);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  // Transaction routes
  app.get(`${apiPrefix}/transactions`, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      
      const transactions = await storage.getAllTransactions(limit, offset);
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.get(`${apiPrefix}/transactions/byDate`, async (req: Request, res: Response) => {
    try {
      let startDate = req.query.startDate ? parseISO(req.query.startDate as string) : new Date();
      let endDate = req.query.endDate ? parseISO(req.query.endDate as string) : new Date();
      
      const transactions = await storage.getTransactionsByDateRange(startDate, endDate);
      res.json(transactions);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  app.get(`${apiPrefix}/transactions/byType/:type`, async (req: Request, res: Response) => {
    try {
      const type = req.params.type;
      if (!['entry', 'subscription', 'cafe'].includes(type)) {
        return res.status(400).json({ message: "Invalid transaction type" });
      }
      
      const transactions = await storage.getTransactionsByType(type as any);
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.get(`${apiPrefix}/transactions/:id`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transaction ID" });
      }
      
      const transaction = await storage.getTransaction(id);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      res.json(transaction);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post(`${apiPrefix}/transactions`, async (req: Request, res: Response) => {
    try {
      console.log("Received transaction data:", req.body);
      // Parse the transaction data with our schema
      const transactionData = insertTransactionSchema.parse(req.body);
      
      // Create the transaction
      const newTransaction = await storage.createTransaction(transactionData);
      res.status(201).json(newTransaction);
    } catch (error: any) {
      console.error("Transaction creation error:", error);
      res.status(400).json({ message: error.message });
    }
  });
  
  // Daily stats routes
  app.get(`${apiPrefix}/stats/daily`, async (req: Request, res: Response) => {
    try {
      const date = req.query.date ? parseISO(req.query.date as string) : new Date();
      const stats = await storage.getDailyStats(date);
      
      if (!stats) {
        return res.json({
          date,
          totalRevenue: 0,
          entriesRevenue: 0,
          entriesCount: 0,
          subscriptionsRevenue: 0,
          subscriptionsCount: 0,
          cafeRevenue: 0,
          cafeOrdersCount: 0
        });
      }
      
      res.json(stats);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  app.get(`${apiPrefix}/stats/range`, async (req: Request, res: Response) => {
    try {
      let startDate, endDate;
      
      if (req.query.startDate && req.query.endDate) {
        startDate = parseISO(req.query.startDate as string);
        endDate = parseISO(req.query.endDate as string);
      } else {
        // Default to current month
        const today = new Date();
        startDate = startOfMonth(today);
        endDate = endOfMonth(today);
      }
      
      const stats = await storage.getDailyStatsByRange(startDate, endDate);
      res.json(stats);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  // User management routes (admin only)
  app.get(`${apiPrefix}/users`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      // Remove passwords from response
      const usersWithoutPasswords = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      res.json(usersWithoutPasswords);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.get(`${apiPrefix}/users/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Remove password from response
      const { password, ...userWithoutPassword } = user;
      
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post(`${apiPrefix}/users`, requireAdmin, async (req: Request, res: Response) => {
    try {
      // Validate user data
      const userData = insertUserSchema.parse(req.body);
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      // Hash the password
      userData.password = await hashPassword(userData.password);
      
      // Create the user
      const newUser = await storage.createUser(userData);
      
      // Remove password from response
      const { password, ...userWithoutPassword } = newUser;
      
      res.status(201).json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  app.patch(`${apiPrefix}/users/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Check if user exists
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // If updating password, hash it
      if (req.body.password) {
        req.body.password = await hashPassword(req.body.password);
      }
      
      // Update user
      const updatedUser = await storage.updateUser(id, req.body);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Remove password from response
      const { password, ...userWithoutPassword } = updatedUser;
      
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  app.delete(`${apiPrefix}/users/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Don't allow deleting yourself
      if (id === (req.user as any).id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      
      const result = await storage.deleteUser(id);
      if (!result) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.status(200).json({ message: "User deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Expense routes
  app.get(`${apiPrefix}/expenses`, async (req: Request, res: Response) => {
    try {
      const expenses = await storage.getAllExpenses();
      res.json(expenses);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.get(`${apiPrefix}/expenses/byDate`, async (req: Request, res: Response) => {
    try {
      let startDate = req.query.startDate ? parseISO(req.query.startDate as string) : new Date();
      let endDate = req.query.endDate ? parseISO(req.query.endDate as string) : new Date();
      
      const expenses = await storage.getExpensesByDateRange(startDate, endDate);
      res.json(expenses);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  app.get(`${apiPrefix}/expenses/byCategory/:category`, async (req: Request, res: Response) => {
    try {
      const category = req.params.category;
      if (!EXPENSE_CATEGORIES.includes(category as any)) {
        return res.status(400).json({ message: "Invalid expense category" });
      }
      
      const expenses = await storage.getExpensesByCategory(category as any);
      res.json(expenses);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.get(`${apiPrefix}/expenses/:id`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid expense ID" });
      }
      
      const expense = await storage.getExpense(id);
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      res.json(expense);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post(`${apiPrefix}/expenses`, requireAdmin, async (req: Request, res: Response) => {
    try {
      // Validate expense data
      const expenseData = insertExpenseSchema.parse(req.body);
      
      // Set created by
      expenseData.createdById = (req.user as any).id;
      
      // Create the expense
      const newExpense = await storage.createExpense(expenseData);
      res.status(201).json(newExpense);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  app.patch(`${apiPrefix}/expenses/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid expense ID" });
      }
      
      const updatedExpense = await storage.updateExpense(id, req.body);
      if (!updatedExpense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      res.json(updatedExpense);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  app.delete(`${apiPrefix}/expenses/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid expense ID" });
      }
      
      const result = await storage.deleteExpense(id);
      if (!result) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      res.status(200).json({ message: "Expense deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Net revenue calculation (revenue - expenses)
  app.get(`${apiPrefix}/stats/net-revenue`, async (req: Request, res: Response) => {
    try {
      let startDate, endDate;
      
      if (req.query.startDate && req.query.endDate) {
        startDate = parseISO(req.query.startDate as string);
        endDate = parseISO(req.query.endDate as string);
      } else {
        // Default to current month
        const today = new Date();
        startDate = startOfMonth(today);
        endDate = endOfMonth(today);
      }
      
      // Get daily stats for the date range
      const stats = await storage.getDailyStatsByRange(startDate, endDate);
      
      // Calculate total revenue
      const totalRevenue = stats.reduce((sum, day) => sum + day.totalRevenue, 0);
      
      // Get expenses for the date range
      const expenses = await storage.getExpensesByDateRange(startDate, endDate);
      
      // Calculate total expenses
      const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
      
      // Calculate net revenue
      const netRevenue = totalRevenue - totalExpenses;
      
      res.json({
        startDate,
        endDate,
        totalRevenue,
        totalExpenses,
        netRevenue,
        expenseBreakdown: expenses.reduce((breakdown: Record<string, number>, expense) => {
          const category = expense.category;
          breakdown[category] = (breakdown[category] || 0) + Number(expense.amount);
          return breakdown;
        }, {})
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  const httpServer = createServer(app);
  return httpServer;
}
