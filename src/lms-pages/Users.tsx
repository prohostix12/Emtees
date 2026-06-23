import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Search, Plus, Edit, Trash2 } from "lucide-react";
import { validatePhoneNumber } from "@contracts/validation";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { useEffect } from "react";

export default function UsersPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editUser, setEditUser] = useState<any>(null);

  const [form, setForm] = useState({
    name: "",
    countryCode: "+91",
    countryISO: "IN",
    phoneNumber: "",
    email: "",
    username: "",
    password: "",
    role: "teacher" as any,
  });

  const canManageUsers = ["super_admin", "admin"].includes(user?.role || "");
  const canViewUsers = ["super_admin", "admin", "academic_head"].includes(user?.role || "");

  const usersQuery = trpc.user.list.useQuery({
    role: roleFilter as any,
    status: statusFilter as any,
    search: search || undefined,
    limit: 50,
    offset: 0,
  }, { enabled: canViewUsers });

  // Load default country settings
  const defaultCountryQuery = trpc.admin.getDefaultCountry.useQuery(undefined, {
    enabled: canViewUsers,
  });

  useEffect(() => {
    if (defaultCountryQuery.data) {
      setForm((prev) => {
        if (prev.phoneNumber === "") {
          return {
            ...prev,
            countryCode: defaultCountryQuery.data.code,
            countryISO: defaultCountryQuery.data.iso,
          };
        }
        return prev;
      });
    }
  }, [defaultCountryQuery.data]);

  const createUser = trpc.user.create.useMutation({
    onSuccess: (data: any) => {
      if (data?.emailError) {
        toast.warning(`User created, but credentials email failed: ${data.emailError}`);
      } else {
        toast.success("User created successfully");
      }
      setOpen(false);
      const defCode = defaultCountryQuery.data?.code || "+91";
      const defIso = defaultCountryQuery.data?.iso || "IN";
      setForm({
        name: "",
        countryCode: defCode,
        countryISO: defIso,
        phoneNumber: "",
        email: "",
        username: "",
        password: "",
        role: "teacher",
      });
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateUser = trpc.user.update.useMutation({
    onSuccess: () => {
      toast.success("User updated");
      setEditOpen(false);
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteUser = trpc.user.delete.useMutation({
    onSuccess: () => {
      toast.success("User deleted");
      setDeleteId(null);
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validatePhoneNumber(form.countryCode, form.phoneNumber, form.countryISO);
    if (error) {
      toast.error(error);
      return;
    }
    createUser.mutate({
      ...form,
      email: form.email || undefined,
    });
  };

  const handleEditOpen = (u: any) => {
    if (!canManageUsers) return;
    setEditUser({
      id: u.id,
      name: u.name,
      countryCode: u.countryCode || "+91",
      countryISO: u.countryISO || "IN",
      phoneNumber: u.phoneNumber || "",
      email: u.email,
      status: u.status,
    });
    setEditOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageUsers || !editUser) return;
    const error = validatePhoneNumber(editUser.countryCode, editUser.phoneNumber, editUser.countryISO);
    if (error) {
      toast.error(error);
      return;
    }
    updateUser.mutate(editUser);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "super_admin":
        return "bg-red-100 text-red-700";
      case "admin":
        return "bg-orange-100 text-orange-700";
      case "academic_head":
        return "bg-purple-100 text-purple-700";
      case "teacher":
        return "bg-blue-100 text-blue-700";
      case "sales_executive":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "super_admin":
        return "Super Admin";
      case "admin":
        return "Admin";
      case "academic_head":
        return "Academic Head";
      case "teacher":
        return "Teacher";
      case "sales_executive":
        return "Sales Team";
      default:
        return role;
    }
  };

  if (!canViewUsers) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Access restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input className="pl-9 w-full sm:w-56" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="teacher">Teachers</option>
            <option value="admin">Admins</option>
            <option value="academic_head">Academic Heads</option>
          </select>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
        <div className="flex gap-2 shrink-0">
          {canManageUsers && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all hover:shadow-md">
                  <Plus className="w-4 h-4 mr-2" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader className="pb-2 border-b">
                  <DialogTitle>Create New User</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
                  <div className="flex-1 overflow-y-auto pr-1 py-2 space-y-4 min-h-0">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Full Name <span className="text-red-500">*</span></label>
                        <Input placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      </div>
                      <PhoneNumberInput
                        label="Phone Number"
                        required
                        countryCode={form.countryCode}
                        countryISO={form.countryISO}
                        value={form.phoneNumber}
                        onChange={(data) => setForm({
                          ...form,
                          countryCode: data.countryCode,
                          countryISO: data.countryISO,
                          phoneNumber: data.phoneNumber
                        })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email <span className="text-gray-400 text-xs">(optional)</span></label>
                      <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Username <span className="text-red-500">*</span></label>
                        <Input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Password <span className="text-red-500">*</span></label>
                        <Input type="password" placeholder="Min 6 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Role <span className="text-red-500">*</span></label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-white dark:bg-gray-950 px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                        value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                      >
                        <option value="teacher">Teacher</option>
                        <option value="admin">Admin</option>
                        <option value="academic_head">Academic Head</option>
                      </select>
                    </div>
                  </div>
                  <div className="pt-4 border-t mt-4">
                    <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={createUser.isPending || !form.name || !form.countryCode || !form.phoneNumber || !!validatePhoneNumber(form.countryCode, form.phoneNumber, form.countryISO) || !form.username || !form.password}>
                      {createUser.isPending ? "Creating..." : "Create User"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card className="border border-slate-100 shadow-sm rounded-xl overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.data?.map((u) => (
                <TableRow key={u.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-mono text-xs font-semibold text-gray-600">{u.unionId}</TableCell>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.phone}</TableCell>
                  <TableCell>
                    <Badge className={getRoleColor(u.role)}>{getRoleLabel(u.role)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.status === "active" ? "default" : "secondary"}>{u.status}</Badge>
                  </TableCell>
                  <TableCell>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-"}</TableCell>
                  <TableCell>
                    {canManageUsers ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleEditOpen(u)}><Edit className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setDeleteId(u.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 font-semibold">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {usersQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="pb-2 border-b"><DialogTitle>Edit User</DialogTitle></DialogHeader>
          {editUser && (
            <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="flex-1 overflow-y-auto pr-1 py-2 space-y-4 min-h-0">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
                    <Input placeholder="Full Name" value={editUser.name} onChange={(e) => setEditUser({ ...editUser, name: e.target.value })} />
                  </div>
                  <PhoneNumberInput
                    label="Phone Number"
                    countryCode={editUser.countryCode}
                    countryISO={editUser.countryISO}
                    value={editUser.phoneNumber}
                    onChange={(data) => setEditUser({
                      ...editUser,
                      countryCode: data.countryCode,
                      countryISO: data.countryISO,
                      phoneNumber: data.phoneNumber
                    })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email <span className="text-gray-400 text-xs">(optional)</span></label>
                  <Input placeholder="Email" value={editUser.email || ""} onChange={(e) => setEditUser({ ...editUser, email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-white dark:bg-gray-950 px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    value={editUser.status}
                    onChange={(e) => setEditUser({ ...editUser, status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                    <option value="on_hold">On Hold</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 border-t mt-4">
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={updateUser.isPending || !editUser.countryCode || !editUser.phoneNumber || !!validatePhoneNumber(editUser.countryCode, editUser.phoneNumber, editUser.countryISO)}>
                  {updateUser.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The user account will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteId && deleteUser.mutate({ id: deleteId })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}