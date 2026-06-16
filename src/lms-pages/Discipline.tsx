import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Shield, AlertTriangle, CheckCircle, UserX } from "lucide-react";

export default function DisciplinePage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [suspendUserId, setSuspendUserId] = useState<number | null>(null);
  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");

  const violations = trpc.admin.listViolations.useQuery(undefined, { enabled: isAdmin });
  const createViolation = trpc.admin.createViolation.useMutation({
    onSuccess: () => { toast.success("Violation recorded"); setOpen(false); violations.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const resolveViolation = trpc.admin.resolveViolation.useMutation({
    onSuccess: () => { toast.success("Violation resolved"); violations.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const suspendUser = trpc.admin.suspendUser.useMutation({
    onSuccess: () => { toast.success("User suspended"); setSuspendUserId(null); violations.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [form, setForm] = useState({ userId: 0, type: "", description: "", action: "" });

  if (!isAdmin) {
    return (
      <div className="text-center py-20">
        <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Access restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Discipline & Violations</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 mr-2" /> Record Violation</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record Violation</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createViolation.mutate(form); }} className="space-y-3 mt-2">
              <Input type="number" placeholder="User ID" value={form.userId} onChange={(e) => setForm({ ...form, userId: Number(e.target.value) })} />
              <Input placeholder="Violation Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
              <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Input placeholder="Action Taken" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} />
              <Button type="submit" className="w-full bg-emerald-600">Record</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reported By</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {violations.data?.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{v.user?.name || "-"}</TableCell>
                  <TableCell><Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" /> {v.type}</Badge></TableCell>
                  <TableCell className="max-w-xs truncate">{v.description}</TableCell>
                  <TableCell>{v.action || "-"}</TableCell>
                  <TableCell><Badge variant={v.status === "open" ? "secondary" : "outline"}>{v.status}</Badge></TableCell>
                  <TableCell>{v.reporter?.name || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {v.status === "open" && (
                        <Button size="sm" variant="outline" className="text-emerald-600 hover:text-emerald-700" onClick={() => resolveViolation.mutate({ violationId: v.id })}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Resolve
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => setSuspendUserId(v.userId)}>
                        <UserX className="w-3 h-3 mr-1" /> Suspend
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!suspendUserId} onOpenChange={(open) => { if (!open) setSuspendUserId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend User</AlertDialogTitle>
            <AlertDialogDescription>This will suspend the user's account. They will not be able to access the platform.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => suspendUserId && suspendUser.mutate({ userId: suspendUserId })}>Suspend</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
