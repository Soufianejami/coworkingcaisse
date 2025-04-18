import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Edit, MoreVertical, Trash } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function DailyEntries() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  
  // State for create form
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  
  // State for edit form
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [editClientName, setEditClientName] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("cash");
  const [editNotes, setEditNotes] = useState("");
  
  // State for delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<any>(null);
  
  // Fetch today's entries
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { data: entries, isLoading } = useQuery({
    queryKey: [`/api/transactions/byType/entry`],
  });
  
  // Calculate totals
  const totalEntries = entries?.length || 0;
  const totalRevenue = entries?.reduce((sum, entry) => sum + entry.amount, 0) || 0;
  
  // Create new entry
  const createEntry = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/transactions', {
        type: "entry",
        amount: 25, // Fixed price for entry
        paymentMethod,
        clientName: clientName || undefined,
        notes: notes || undefined,
        date: new Date()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/transactions/byType/entry`] });
      queryClient.invalidateQueries({ queryKey: [`/api/stats/daily?date=${todayStr}`] });
      toast({
        title: "Entrée ajoutée",
        description: "L'entrée journalière a été enregistrée avec succès."
      });
      
      // Reset form
      setClientName("");
      setNotes("");
      setOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue. Veuillez réessayer.",
        variant: "destructive"
      });
    }
  });
  
  // Edit entry mutation
  const updateEntry = useMutation({
    mutationFn: async () => {
      if (!selectedEntry) return;
      return apiRequest('PATCH', `/api/transactions/${selectedEntry.id}`, {
        clientName: editClientName || undefined,
        paymentMethod: editPaymentMethod,
        notes: editNotes || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/transactions/byType/entry`] });
      toast({
        title: "Entrée modifiée",
        description: "L'entrée journalière a été modifiée avec succès."
      });
      setEditDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la modification. Veuillez réessayer.",
        variant: "destructive"
      });
    }
  });
  
  // Delete entry mutation
  const deleteEntry = useMutation({
    mutationFn: async () => {
      if (!entryToDelete) return;
      return apiRequest('DELETE', `/api/transactions/${entryToDelete.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/transactions/byType/entry`] });
      queryClient.invalidateQueries({ queryKey: [`/api/stats/daily?date=${todayStr}`] });
      toast({
        title: "Entrée supprimée",
        description: "L'entrée journalière a été supprimée avec succès."
      });
      setDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la suppression. Veuillez réessayer.",
        variant: "destructive"
      });
    }
  });
  
  // Form submission handlers
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createEntry.mutate();
  };
  
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateEntry.mutate();
  };
  
  // Open edit dialog with entry data
  const handleEditClick = (entry: any) => {
    setSelectedEntry(entry);
    setEditClientName(entry.clientName || "");
    setEditPaymentMethod(entry.paymentMethod);
    setEditNotes(entry.notes || "");
    setEditDialogOpen(true);
  };
  
  // Open delete confirmation dialog
  const handleDeleteClick = (entry: any) => {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  };
  
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800">Entrées journalières</h2>
          <p className="text-sm text-gray-500">Gestion des entrées à 25 DH par jour</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Ajouter une entrée</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle entrée journalière</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <label htmlFor="client-name" className="block text-sm font-medium text-gray-700">
                  Nom du client (optionnel)
                </label>
                <Input
                  id="client-name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nom du client"
                  className="mt-1"
                />
              </div>
              
              <div>
                <label htmlFor="payment-method" className="block text-sm font-medium text-gray-700">
                  Méthode de paiement
                </label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Méthode de paiement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Espèces</SelectItem>
                    <SelectItem value="card">Carte bancaire</SelectItem>
                    <SelectItem value="mobile_transfer">Transfert mobile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                  Notes (optionnel)
                </label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes additionnelles"
                  className="mt-1"
                  rows={3}
                />
              </div>
              
              <div className="pt-2 flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  type="button" 
                  onClick={() => setOpen(false)}
                >
                  Annuler
                </Button>
                <Button 
                  type="submit" 
                  disabled={createEntry.isPending}
                >
                  {createEntry.isPending ? "Enregistrement..." : "Enregistrer (25 DH)"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium text-gray-700">
              Total des entrées aujourd'hui
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalEntries}</div>
            <p className="text-sm text-gray-500 mt-1">entrées enregistrées</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium text-gray-700">
              Revenu total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalRevenue} DH</div>
            <p className="text-sm text-gray-500 mt-1">pour aujourd'hui</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des entrées</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Heure</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Paiement</TableHead>
                <TableHead>Notes</TableHead>
                {isSuperAdmin && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={isSuperAdmin ? 6 : 5} className="text-center py-4">
                    Chargement des entrées...
                  </TableCell>
                </TableRow>
              ) : entries?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isSuperAdmin ? 6 : 5} className="text-center py-4">
                    Aucune entrée enregistrée pour aujourd'hui.
                  </TableCell>
                </TableRow>
              ) : (
                entries?.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {format(new Date(entry.date), 'dd/MM/yyyy - HH:mm')}
                    </TableCell>
                    <TableCell>{entry.clientName || "Anonyme"}</TableCell>
                    <TableCell>{entry.amount} DH</TableCell>
                    <TableCell>
                      {entry.paymentMethod === 'cash' && 'Espèces'}
                      {entry.paymentMethod === 'card' && 'Carte bancaire'}
                      {entry.paymentMethod === 'mobile_transfer' && 'Transfert mobile'}
                    </TableCell>
                    <TableCell>{entry.notes || "-"}</TableCell>
                    {isSuperAdmin && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Ouvrir menu</span>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditClick(entry)}>
                              <Edit className="mr-2 h-4 w-4" />
                              <span>Modifier</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteClick(entry)}>
                              <Trash className="mr-2 h-4 w-4" />
                              <span>Supprimer</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Entry Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l'entrée</DialogTitle>
            <DialogDescription>
              Modifier les détails de l'entrée sélectionnée.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
            <div>
              <label htmlFor="edit-client-name" className="block text-sm font-medium text-gray-700">
                Nom du client (optionnel)
              </label>
              <Input
                id="edit-client-name"
                value={editClientName}
                onChange={(e) => setEditClientName(e.target.value)}
                placeholder="Nom du client"
                className="mt-1"
              />
            </div>
            
            <div>
              <label htmlFor="edit-payment-method" className="block text-sm font-medium text-gray-700">
                Méthode de paiement
              </label>
              <Select value={editPaymentMethod} onValueChange={setEditPaymentMethod}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Méthode de paiement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Espèces</SelectItem>
                  <SelectItem value="card">Carte bancaire</SelectItem>
                  <SelectItem value="mobile_transfer">Transfert mobile</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label htmlFor="edit-notes" className="block text-sm font-medium text-gray-700">
                Notes (optionnel)
              </label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Notes additionnelles"
                className="mt-1"
                rows={3}
              />
            </div>
            
            <div className="pt-2 flex justify-end gap-2">
              <Button 
                variant="outline" 
                type="button" 
                onClick={() => setEditDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button 
                type="submit" 
                disabled={updateEntry.isPending}
              >
                {updateEntry.isPending ? "Enregistrement..." : "Enregistrer les modifications"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible et supprimera définitivement l'entrée journalière.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteEntry.mutate()}
              disabled={deleteEntry.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEntry.isPending ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
