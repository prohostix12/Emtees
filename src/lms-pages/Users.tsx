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
import { Search, Plus, Edit, Trash2, Eye, Calendar, GraduationCap, Award, BookOpen, Users as UsersIcon, MapPin, Activity, Briefcase, User } from "lucide-react";
import { validatePhoneNumber } from "@contracts/validation";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

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
    gender: "Male",
    dateOfBirth: "",
    educationalQualification: "",
    specialization: "",
    teachingExperience: "",
    address: "",
    status: "active",
  });

  const [detailsTeacherId, setDetailsTeacherId] = useState<number | null>(null);

  const canManageUsers = ["super_admin", "admin"].includes(user?.role || "");
  const canViewUsers = ["super_admin", "admin", "academic_head"].includes(user?.role || "");

  const usersQuery = trpc.user.list.useQuery({
    role: roleFilter as any,
    status: statusFilter as any,
    search: search || undefined,
    limit: 50,
    offset: 0,
  }, { enabled: canViewUsers });

  const teacherDetailsQuery = trpc.user.getById.useQuery(
    { id: detailsTeacherId || 0 },
    { enabled: !!detailsTeacherId }
  );

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
        gender: "Male",
        dateOfBirth: "",
        educationalQualification: "",
        specialization: "",
        teachingExperience: "",
        address: "",
        status: "active",
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

    if (form.role === "teacher") {
      if (form.name.trim().length < 3) {
        toast.error("Full Name must be at least 3 characters.");
        return;
      }
      if (!form.email) {
        toast.error("Email Address is required.");
        return;
      }
      if (!/\S+@\S+\.\S+/.test(form.email)) {
        toast.error("Invalid email address format.");
        return;
      }
      if (!form.gender) {
        toast.error("Gender selection is required.");
        return;
      }
      if (!form.dateOfBirth) {
        toast.error("Date of Birth is required.");
        return;
      }
      const dob = new Date(form.dateOfBirth);
      if (dob > new Date()) {
        toast.error("Date of Birth cannot be in the future.");
        return;
      }
      if (!form.educationalQualification || form.educationalQualification.trim().length < 1) {
        toast.error("Educational Qualification is required.");
        return;
      }
      if (!form.specialization || form.specialization.trim().length < 2) {
        toast.error("Specialization is required (min 2 characters).");
        return;
      }
      if (form.teachingExperience === "" || Number(form.teachingExperience) < 0) {
        toast.error("Teaching Experience cannot be negative.");
        return;
      }
      if (!form.address || form.address.trim().length < 1) {
        toast.error("Address is required.");
        return;
      }
    }

    createUser.mutate({
      ...form,
      email: form.email || undefined,
      teachingExperience: form.role === "teacher" ? Number(form.teachingExperience) : undefined,
      status: form.status as any,
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
      email: u.email || "",
      status: u.status,
      role: u.role,
      username: u.username || "",
      password: "", // Optional during edit
      gender: u.gender || "Male",
      dateOfBirth: u.dateOfBirth ? new Date(u.dateOfBirth).toISOString().split("T")[0] : "",
      educationalQualification: u.educationalQualification || "",
      specialization: u.specialization || "",
      teachingExperience: u.teachingExperience !== undefined && u.teachingExperience !== null ? String(u.teachingExperience) : "",
      address: u.address || "",
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

    if (editUser.role === "teacher") {
      if (editUser.name.trim().length < 3) {
        toast.error("Full Name must be at least 3 characters.");
        return;
      }
      if (!editUser.email) {
        toast.error("Email Address is required.");
        return;
      }
      if (!/\S+@\S+\.\S+/.test(editUser.email)) {
        toast.error("Invalid email address format.");
        return;
      }
      if (!editUser.gender) {
        toast.error("Gender selection is required.");
        return;
      }
      if (!editUser.dateOfBirth) {
        toast.error("Date of Birth is required.");
        return;
      }
      const dob = new Date(editUser.dateOfBirth);
      if (dob > new Date()) {
        toast.error("Date of Birth cannot be in the future.");
        return;
      }
      if (!editUser.educationalQualification || editUser.educationalQualification.trim().length < 1) {
        toast.error("Educational Qualification is required.");
        return;
      }
      if (!editUser.specialization || editUser.specialization.trim().length < 2) {
        toast.error("Specialization is required (min 2 characters).");
        return;
      }
      if (editUser.teachingExperience === "" || Number(editUser.teachingExperience) < 0) {
        toast.error("Teaching Experience cannot be negative.");
        return;
      }
      if (!editUser.address || editUser.address.trim().length < 1) {
        toast.error("Address is required.");
        return;
      }
    }

    updateUser.mutate({
      ...editUser,
      password: editUser.password || undefined,
      teachingExperience: editUser.role === "teacher" ? Number(editUser.teachingExperience) : undefined,
      status: editUser.status as any,
    });
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
              <DialogContent className="w-[95vw] md:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader className="pb-2 border-b">
                  <DialogTitle>Create New User</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
                  <div className="flex-1 overflow-y-auto pr-1 py-2 space-y-4 min-h-0">
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

                    {form.role === "teacher" ? (
                      <div className="space-y-4">
                        {/* 1. Personal Information Section */}
                        <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                          <h4 className="font-bold text-xs text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" />
                            Personal Information
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-gray-600">Full Name <span className="text-red-500">*</span></label>
                              <Input placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-gray-600">Email Address <span className="text-red-500">*</span></label>
                              <Input type="email" placeholder="Email Address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">Gender <span className="text-red-500">*</span></label>
                                <select
                                  className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                                  value={form.gender}
                                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                                >
                                  <option value="Male">Male</option>
                                  <option value="Female">Female</option>
                                  <option value="Other">Other</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-600">Date of Birth <span className="text-red-500">*</span></label>
                                <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Address <span className="text-red-500">*</span></label>
                            <Textarea placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="min-h-[60px]" />
                          </div>
                        </div>

                        {/* 2. Professional Information Section */}
                        <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                          <h4 className="font-bold text-xs text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                            <GraduationCap className="w-3.5 h-3.5" />
                            Professional Information
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-gray-600">Specialization <span className="text-red-500">*</span></label>
                              <Input placeholder="e.g. IELTS, Spoken English" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-gray-600">Teaching Experience (Years) <span className="text-red-500">*</span></label>
                              <div className="flex items-center gap-2">
                                <Input type="number" placeholder="Years" value={form.teachingExperience} onChange={(e) => setForm({ ...form, teachingExperience: e.target.value })} min={0} />
                                <span className="text-xs text-gray-500 font-semibold shrink-0">Years</span>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Educational Qualification <span className="text-red-500">*</span></label>
                            <Textarea placeholder="Educational Qualification" value={form.educationalQualification} onChange={(e) => setForm({ ...form, educationalQualification: e.target.value })} className="min-h-[60px]" />
                          </div>
                        </div>

                        {/* 3. Account Information Section */}
                        <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                          <h4 className="font-bold text-xs text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5" />
                            Account Information
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-gray-600">Username <span className="text-red-500">*</span></label>
                              <Input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-gray-600">Password <span className="text-red-500">*</span></label>
                              <Input type="password" placeholder="Min 6 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Status <span className="text-red-500">*</span></label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50"
                              value={form.status}
                              onChange={(e) => setForm({ ...form, status: e.target.value })}
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Simple Layout for Non-Teacher Roles */
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
                      </div>
                    )}
                  </div>
                  <div className="pt-4 border-t mt-4">
                    <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all" disabled={createUser.isPending}>
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
                    <div className="flex gap-1">
                      {u.role === "teacher" && (
                        <Button size="sm" variant="ghost" className="text-emerald-600 hover:text-emerald-700" onClick={() => setDetailsTeacherId(u.id)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canManageUsers ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => handleEditOpen(u)}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setDeleteId(u.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </>
                      ) : (
                        u.role !== "teacher" && <span className="text-xs text-gray-400 font-semibold">-</span>
                      )}
                    </div>
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
        <DialogContent className="w-[95vw] md:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="pb-2 border-b"><DialogTitle>Edit User</DialogTitle></DialogHeader>
          {editUser && (
            <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="flex-1 overflow-y-auto pr-1 py-2 space-y-4 min-h-0">
                {editUser.role === "teacher" ? (
                  <div className="space-y-4">
                    {/* 1. Personal Information */}
                    <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                      <h4 className="font-bold text-xs text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        Personal Information
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-600">Full Name <span className="text-red-500">*</span></label>
                          <Input placeholder="Full Name" value={editUser.name} onChange={(e) => setEditUser({ ...editUser, name: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-600">Email Address <span className="text-red-500">*</span></label>
                          <Input type="email" placeholder="Email Address" value={editUser.email} onChange={(e) => setEditUser({ ...editUser, email: e.target.value })} />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <PhoneNumberInput
                          label="Phone Number"
                          required
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
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Gender <span className="text-red-500">*</span></label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                              value={editUser.gender}
                              onChange={(e) => setEditUser({ ...editUser, gender: e.target.value })}
                            >
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Date of Birth <span className="text-red-500">*</span></label>
                            <Input type="date" value={editUser.dateOfBirth} onChange={(e) => setEditUser({ ...editUser, dateOfBirth: e.target.value })} />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-600">Address <span className="text-red-500">*</span></label>
                        <Textarea placeholder="Address" value={editUser.address} onChange={(e) => setEditUser({ ...editUser, address: e.target.value })} className="min-h-[60px]" />
                      </div>
                    </div>

                    {/* 2. Professional Information */}
                    <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                      <h4 className="font-bold text-xs text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5" />
                        Professional Information
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-600">Specialization <span className="text-red-500">*</span></label>
                          <Input placeholder="e.g. IELTS, Spoken English" value={editUser.specialization} onChange={(e) => setEditUser({ ...editUser, specialization: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-600">Teaching Experience (Years) <span className="text-red-500">*</span></label>
                          <div className="flex items-center gap-2">
                            <Input type="number" placeholder="Years" value={editUser.teachingExperience} onChange={(e) => setEditUser({ ...editUser, teachingExperience: e.target.value })} min={0} />
                            <span className="text-xs text-gray-500 font-semibold shrink-0">Years</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-600">Educational Qualification <span className="text-red-500">*</span></label>
                        <Textarea placeholder="Educational Qualification" value={editUser.educationalQualification} onChange={(e) => setEditUser({ ...editUser, educationalQualification: e.target.value })} className="min-h-[60px]" />
                      </div>
                    </div>

                    {/* 3. Account Information */}
                    <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                      <h4 className="font-bold text-xs text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5" />
                        Account Information
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-600">Username <span className="text-red-500">*</span></label>
                          <Input placeholder="Username" value={editUser.username} onChange={(e) => setEditUser({ ...editUser, username: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-600">Password <span className="text-gray-400 text-[10px]">(Leave empty to keep unchanged)</span></label>
                          <Input type="password" placeholder="Min 6 characters" value={editUser.password} onChange={(e) => setEditUser({ ...editUser, password: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-600">Status <span className="text-red-500">*</span></label>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50"
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
                  </div>
                ) : (
                  /* Simple Layout for Non-Teacher Roles */
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
                )}
              </div>
              <div className="pt-4 border-t mt-4">
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all" disabled={updateUser.isPending}>
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

      {/* Teacher Profile Details Dialog */}
      <Dialog open={!!detailsTeacherId} onOpenChange={(open) => !open && setDetailsTeacherId(null)}>
        <DialogContent className="w-[95vw] md:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-6">
          <DialogHeader className="pb-3 border-b">
            <div className="flex justify-between items-start w-full">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-gray-800">
                  <User className="w-5 h-5 text-emerald-600" />
                  {teacherDetailsQuery.data?.name || "Teacher Profile"}
                </DialogTitle>
                {teacherDetailsQuery.data && (
                  <p className="text-xs text-gray-400 font-mono font-bold mt-1">
                    Teacher ID: {teacherDetailsQuery.data.unionId}
                  </p>
                )}
              </div>
              {teacherDetailsQuery.data && (
                <Badge variant={teacherDetailsQuery.data.status === "active" ? "default" : "secondary"}>
                  {teacherDetailsQuery.data.status}
                </Badge>
              )}
            </div>
          </DialogHeader>

          {teacherDetailsQuery.isLoading ? (
            <div className="py-20 text-center text-gray-500">Loading teacher profile...</div>
          ) : teacherDetailsQuery.data ? (
            <Tabs defaultValue="personal" className="flex-1 flex flex-col min-h-0 mt-4">
              <TabsList className="flex w-full items-center justify-start gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4 text-xs font-semibold overflow-x-auto no-scrollbar scroll-smooth select-none">
                <TabsTrigger value="personal" className="flex-none px-4 py-2 rounded-lg transition-all duration-200">Personal Information</TabsTrigger>
                <TabsTrigger value="professional" className="flex-none px-4 py-2 rounded-lg transition-all duration-200">Professional & Assignments</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto pr-1 min-h-0">
                {/* 1. Personal Details Tab */}
                <TabsContent value="personal" className="space-y-4 outline-none">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-slate-100 shadow-sm bg-slate-50/50">
                      <CardContent className="p-5 space-y-3 text-sm text-slate-600">
                        <div className="flex items-center gap-2 pb-2 border-b">
                          <User className="w-4 h-4 text-emerald-600" />
                          <span className="font-bold text-gray-700">Identity Details</span>
                        </div>
                        <p><strong>Full Name:</strong> {teacherDetailsQuery.data.name}</p>
                        <p><strong>Teacher ID:</strong> {teacherDetailsQuery.data.unionId}</p>
                        <p><strong>Gender:</strong> <span className="capitalize">{teacherDetailsQuery.data.gender || "-"}</span></p>
                        <p><strong>Date of Birth:</strong> {teacherDetailsQuery.data.dateOfBirth ? new Date(teacherDetailsQuery.data.dateOfBirth).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "-"}</p>
                        <p><strong>Status:</strong> <span className="capitalize">{teacherDetailsQuery.data.status}</span></p>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-100 shadow-sm bg-slate-50/50">
                      <CardContent className="p-5 space-y-3 text-sm text-slate-600">
                        <div className="flex items-center gap-2 pb-2 border-b">
                          <MapPin className="w-4 h-4 text-emerald-600" />
                          <span className="font-bold text-gray-700">Contact & Address</span>
                        </div>
                        <p><strong>Email:</strong> {teacherDetailsQuery.data.email || "-"}</p>
                        <p><strong>Phone Number:</strong> {teacherDetailsQuery.data.phone || "-"}</p>
                        <div className="space-y-1">
                          <strong>Address:</strong>
                          <p className="whitespace-pre-line bg-white p-2.5 rounded border text-xs text-gray-600 mt-1">{teacherDetailsQuery.data.address || "No address provided."}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* 2. Professional Details & Assignments Tab */}
                <TabsContent value="professional" className="space-y-6 outline-none">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border-slate-100 shadow-sm bg-slate-50/50">
                      <CardContent className="p-4 space-y-2 text-sm text-slate-600">
                        <div className="flex items-center gap-1.5 font-bold text-gray-700 border-b pb-1.5 mb-2">
                          <GraduationCap className="w-4 h-4 text-emerald-600" />
                          Qualifications
                        </div>
                        <p className="whitespace-pre-line text-xs">{teacherDetailsQuery.data.educationalQualification || "-"}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-100 shadow-sm bg-slate-50/50">
                      <CardContent className="p-4 space-y-2 text-sm text-slate-600">
                        <div className="flex items-center gap-1.5 font-bold text-gray-700 border-b pb-1.5 mb-2">
                          <Award className="w-4 h-4 text-emerald-600" />
                          Specialization
                        </div>
                        <p className="text-xs font-semibold">{teacherDetailsQuery.data.specialization || "-"}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-100 shadow-sm bg-slate-50/50">
                      <CardContent className="p-4 space-y-2 text-sm text-slate-600">
                        <div className="flex items-center gap-1.5 font-bold text-gray-700 border-b pb-1.5 mb-2">
                          <Calendar className="w-4 h-4 text-emerald-600" />
                          Work History
                        </div>
                        <p className="text-xs"><strong>Experience:</strong> {teacherDetailsQuery.data.teachingExperience !== undefined && teacherDetailsQuery.data.teachingExperience !== null ? `${teacherDetailsQuery.data.teachingExperience} Years` : "-"}</p>
                        <p className="text-xs"><strong>Joining Date:</strong> {teacherDetailsQuery.data.createdAt ? new Date(teacherDetailsQuery.data.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "-"}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Assigned Batches Section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 border-b pb-2">
                      <BookOpen className="w-4 h-4 text-emerald-600" />
                      <h4 className="font-bold text-sm text-gray-800">Assigned Batches</h4>
                    </div>
                    <Card className="border border-slate-100 shadow-sm overflow-hidden">
                      <CardContent className="p-0 overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead className="text-xs font-bold py-2">Batch ID</TableHead>
                              <TableHead className="text-xs font-bold py-2">Batch Name</TableHead>
                              <TableHead className="text-xs font-bold py-2">Course/Module</TableHead>
                              <TableHead className="text-xs font-bold py-2">Time Slot</TableHead>
                              <TableHead className="text-xs font-bold py-2">Max Students</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(teacherDetailsQuery.data as any).assignedBatches?.map((b: any) => (
                              <TableRow key={b.id}>
                                <TableCell className="font-mono text-xs py-2">{b.id}</TableCell>
                                <TableCell className="font-semibold text-xs py-2">{b.name}</TableCell>
                                <TableCell className="text-xs py-2">{b.module?.name || "-"}</TableCell>
                                <TableCell className="text-xs py-2">{b.timeSlot || "-"}</TableCell>
                                <TableCell className="text-xs py-2">{b.maxStudents || "-"}</TableCell>
                              </TableRow>
                            ))}
                            {(!(teacherDetailsQuery.data as any).assignedBatches || (teacherDetailsQuery.data as any).assignedBatches.length === 0) && (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-xs text-gray-500 py-6">
                                  No batches assigned to this teacher.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Assigned Students Section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 border-b pb-2">
                      <UsersIcon className="w-4 h-4 text-emerald-600" />
                      <h4 className="font-bold text-sm text-gray-800">Assigned Students</h4>
                    </div>
                    <Card className="border border-slate-100 shadow-sm overflow-hidden">
                      <CardContent className="p-0 overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead className="text-xs font-bold py-2">Student ID</TableHead>
                              <TableHead className="text-xs font-bold py-2">Name</TableHead>
                              <TableHead className="text-xs font-bold py-2">Phone</TableHead>
                              <TableHead className="text-xs font-bold py-2">Enrollment Type</TableHead>
                              <TableHead className="text-xs font-bold py-2">Batch</TableHead>
                              <TableHead className="text-xs font-bold py-2">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(teacherDetailsQuery.data as any).assignedStudents?.map((s: any) => (
                              <TableRow key={s.id}>
                                <TableCell className="font-mono text-xs py-2">{s.unionId}</TableCell>
                                <TableCell className="font-semibold text-xs py-2">{s.name}</TableCell>
                                <TableCell className="text-xs py-2">{s.phone}</TableCell>
                                <TableCell className="text-xs py-2">
                                  <Badge className="bg-slate-100 text-slate-800 border-none font-semibold text-[10px]">{s.enrollmentType}</Badge>
                                </TableCell>
                                <TableCell className="text-xs py-2">{s.batchName || "N/A"}</TableCell>
                                <TableCell className="text-xs py-2">
                                  <Badge variant={s.status === "active" ? "default" : "secondary"} className="text-[10px]">
                                    {s.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                            {(!(teacherDetailsQuery.data as any).assignedStudents || (teacherDetailsQuery.data as any).assignedStudents.length === 0) && (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center text-xs text-gray-500 py-6">
                                  No students assigned to this teacher.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            <div className="py-20 text-center text-red-500">Failed to load teacher details.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}