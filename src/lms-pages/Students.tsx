import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, Plus, Upload, Edit, Trash2, Download, Eye, FileText, Send, Calendar, CreditCard, Award, MessageCircle, FileUp, User, Clock, AlertTriangle, CheckCircle, RefreshCcw, BookOpen, History, Settings, X } from "lucide-react";
import { validatePhoneNumber } from "@contracts/validation";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { useEffect } from "react";

export default function StudentsPage() {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "admin"].includes(user?.role || "");
  const isAcademicHead = user?.role === "academic_head";
  const isTeacher = user?.role === "teacher";
  const isStaff = isAdmin || isAcademicHead || isTeacher;

  // Search, Filters & Pagination states
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("search") || "";
    }
    return "";
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "pending_enrollment" | "alumni">("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  // Dialog / Dialog states
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editStudent, setEditStudent] = useState<any>(null);
  const [csvData, setCsvData] = useState("");
  const [detailsStudentId, setDetailsStudentId] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const view = new URLSearchParams(window.location.search).get("view");
      return view ? parseInt(view, 10) || null : null;
    }
    return null;
  });

  // New States for Course & Class Package Enhancement
  const [packageEditMode, setPackageEditMode] = useState(false);
  const [packageForm, setPackageForm] = useState<any>({
    oneToOne: { total: 0, min30: 0, min45: 0, min60: 0 },
    group: { total: 0, min30: 0, min45: 0, min60: 0 },
  });
  const [teacherAssignMode, setTeacherAssignMode] = useState(false);
  const [assignTeachersForm, setAssignTeachersForm] = useState<number[]>([]);
  const [batchChangeMode, setBatchChangeMode] = useState(false);
  const [newBatchCourseId, setNewBatchCourseId] = useState<number | "">("");
  const [newBatchId, setNewBatchId] = useState<number | "">("");

  // Form states
  const [idGenerationType, setIdGenerationType] = useState<"auto" | "manual">("auto");
  const [form, setForm] = useState<{
    name: string;
    countryCode: string;
    countryISO: string;
    phoneNumber: string;
    email: string;
    username: string;
    password: string;
    courseId: number | "";
    batchId: number | "";
    feesTotal: number;
    allocatedOneToOneSessions: number;
    allocatedGroupSessions: number;
    paymentType: "FULL_PAYMENT" | "INSTALLMENT";
    gender: string;
    dob: string;
    educationalQualification: string;
    parentName: string;
    parentPhone: string;
    parentCountryCode: string;
    parentCountryISO: string;
    parentPhoneNumber: string;
    notes: string;
    enrollmentId: string;
  }>({
    name: "",
    countryCode: "+91",
    countryISO: "IN",
    phoneNumber: "",
    email: "",
    username: "",
    password: "",
    courseId: "",
    batchId: "",
    feesTotal: 0,
    allocatedOneToOneSessions: 0,
    allocatedGroupSessions: 0,
    paymentType: "FULL_PAYMENT",
    gender: "",
    dob: "",
    educationalQualification: "",
    parentName: "",
    parentPhone: "",
    parentCountryCode: "+91",
    parentCountryISO: "IN",
    parentPhoneNumber: "",
    notes: "",
    enrollmentId: "",
  });

  const [paymentType, setPaymentType] = useState<"FULL_PAYMENT" | "INSTALLMENT">("FULL_PAYMENT");
  const [installmentCount, setInstallmentCount] = useState<number>(2);
  const [installments, setInstallments] = useState<Array<{ installmentNumber: number; amount: number; dueDate?: string }>>([]);

  // Document upload state
  const [newDoc, setNewDoc] = useState({ name: "", url: "" });

  // Fee adjustment state
  const [feeForm, setFeeForm] = useState({ minInitialPayment: 0, paymentDueDate: "" });

  // Session adjustment state
  const [sessionForm, setSessionForm] = useState({ allocatedOneToOne: 0, allocatedGroup: 0, reason: "" });

  // tRPC Queries
  const activeCoursesQuery = trpc.learning.listModules.useQuery();
  const activeCourses = activeCoursesQuery.data?.filter((m) => m.status === "active") || [];
  const selectedCourse = activeCourses.find((c) => c.id === Number(form.courseId));
  const activeBatches = selectedCourse?.batches?.filter((b: any) => b.status === "active") || [];

  const filterCourseSelected = activeCourses.find((c) => c.id === Number(courseFilter));
  const filterBatches = filterCourseSelected?.batches || [];

  const studentsQuery = trpc.students.list.useQuery({
    search: search || undefined,
    status: statusFilter,
    courseId: courseFilter !== "all" ? Number(courseFilter) : undefined,
    batchId: batchFilter !== "all" ? Number(batchFilter) : undefined,
    limit,
    offset: (page - 1) * limit,
  }, { enabled: isStaff });

  const profileQuery = trpc.students.getProfile.useQuery(
    { id: detailsStudentId || 0 },
    { enabled: !!detailsStudentId }
  );

  // tRPC Mutations
  const createStudentMutation = trpc.students.create.useMutation({
    onSuccess: (data) => {
      if (data.emailError) {
        toast.warning(`Student created, but credentials email failed: ${data.emailError}`);
      } else {
        toast.success("Student created successfully!");
      }
      setOpen(false);
      resetForm();
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateStudentMutation = trpc.students.update.useMutation({
    onSuccess: () => {
      toast.success("Student details updated successfully");
      setEditOpen(false);
      setEditStudent(null);
      studentsQuery.refetch();
      if (detailsStudentId) profileQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteStudentMutation = trpc.students.delete.useMutation({
    onSuccess: () => {
      toast.success("Student account deleted successfully");
      setDeleteId(null);
      setDetailsStudentId(null);
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const importStudentsMutation = trpc.students.import.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} students successfully`);
      setImportOpen(false);
      setCsvData("");
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const addDocumentMutation = trpc.students.addDocument.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      setNewDoc({ name: "", url: "" });
      profileQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteDocumentMutation = trpc.students.deleteDocument.useMutation({
    onSuccess: () => {
      toast.success("Document deleted");
      profileQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const recordPaymentMutation = trpc.admin.recordPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded successfully");
      profileQuery.refetch();
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const adjustFeesMutation = trpc.admin.adjustStudentFees.useMutation({
    onSuccess: () => {
      toast.success("Fees adjusted successfully");
      profileQuery.refetch();
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const adjustSessionsMutation = trpc.admin.adjustStudentSessions.useMutation({
    onSuccess: () => {
      toast.success("Sessions adjusted successfully");
      profileQuery.refetch();
      studentsQuery.refetch();
      setSessionForm(prev => ({ ...prev, reason: "" }));
    },
    onError: (err) => toast.error(err.message),
  });

  const teachersAvailabilityQuery = trpc.students.getTeachersAvailability.useQuery(undefined, {
    enabled: !!detailsStudentId,
  });

  const updatePackageMutation = trpc.students.updateStudentPackage.useMutation({
    onSuccess: () => {
      toast.success("Package details updated successfully");
      setPackageEditMode(false);
      profileQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateTeacherAssignmentMutation = trpc.students.updateTeacherAssignment.useMutation({
    onSuccess: () => {
      toast.success("Teacher assignment updated successfully");
      setTeacherAssignMode(false);
      profileQuery.refetch();
      teachersAvailabilityQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const changeBatchMutation = trpc.students.changeBatch.useMutation({
    onSuccess: () => {
      toast.success("Batch changed successfully");
      setBatchChangeMode(false);
      profileQuery.refetch();
      studentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Load default country settings
  const defaultCountryQuery = trpc.admin.getDefaultCountry.useQuery(undefined, {
    enabled: isAdmin || isAcademicHead,
  });

  useEffect(() => {
    if (defaultCountryQuery.data) {
      setForm((prev) => {
        if (prev.phoneNumber === "") {
          return {
            ...prev,
            countryCode: defaultCountryQuery.data.code,
            countryISO: defaultCountryQuery.data.iso,
            parentCountryCode: defaultCountryQuery.data.code,
            parentCountryISO: defaultCountryQuery.data.iso,
          };
        }
        return prev;
      });
    }
  }, [defaultCountryQuery.data]);

  // Helper calculation for installments
  const calculateInstallments = (totalFee: number, count: number) => {
    if (totalFee <= 0) return [];
    const base = Math.floor(totalFee / count);
    const remainder = totalFee % count;
    return Array.from({ length: count }, (_, i) => ({
      installmentNumber: i + 1,
      amount: base + (i === count - 1 ? remainder : 0),
      dueDate: "",
    }));
  };

  const handleFeesTotalChange = (fee: number) => {
    setForm((prev) => ({ ...prev, feesTotal: fee }));
    if (paymentType === "INSTALLMENT") {
      setInstallments(calculateInstallments(fee, installmentCount));
    }
  };

  const handleInstallmentCountChange = (count: number) => {
    setInstallmentCount(count);
    setInstallments(calculateInstallments(form.feesTotal, count));
  };

  const handleInstallmentAmountChange = (index: number, amt: number) => {
    setInstallments((prev) => {
      const updated = [...prev];
      updated[index].amount = amt;
      return updated;
    });
  };

  const handleInstallmentDateChange = (index: number, date: string) => {
    setInstallments((prev) => {
      const updated = [...prev];
      updated[index].dueDate = date;
      return updated;
    });
  };

  const handleCourseChange = (courseIdVal: string) => {
    setForm((prev) => ({
      ...prev,
      courseId: courseIdVal ? Number(courseIdVal) : "",
      batchId: "",
      feesTotal: 0,
    }));
  };

  const handleBatchChange = (batchIdVal: string) => {
    const bId = batchIdVal ? Number(batchIdVal) : "";
    let fee = 0;
    if (bId) {
      const selectedBatch = activeBatches.find((b: any) => b.id === bId);
      fee = selectedBatch ? parseFloat(selectedBatch.courseFee || "0") : 0;
    }
    setForm((prev) => ({
      ...prev,
      batchId: bId,
      feesTotal: fee,
    }));
    if (paymentType === "INSTALLMENT") {
      setInstallments(calculateInstallments(fee, installmentCount));
    }
  };

  const resetForm = () => {
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
      courseId: "",
      batchId: "",
      feesTotal: 0,
      allocatedOneToOneSessions: 0,
      allocatedGroupSessions: 0,
      paymentType: "FULL_PAYMENT",
      gender: "",
      dob: "",
      educationalQualification: "",
      parentName: "",
      parentPhone: "",
      parentCountryCode: defCode,
      parentCountryISO: defIso,
      parentPhoneNumber: "",
      notes: "",
      enrollmentId: "",
    });
    setIdGenerationType("auto");
    setPaymentType("FULL_PAYMENT");
    setInstallmentCount(2);
    setInstallments([]);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseId || !form.batchId) {
      toast.error("Course and Batch are required");
      return;
    }
    const error = validatePhoneNumber(form.countryCode, form.phoneNumber, form.countryISO);
    if (error) {
      toast.error(error);
      return;
    }
    const sumInstallments = installments.reduce((sum, inst) => sum + inst.amount, 0);
    if (paymentType === "INSTALLMENT" && sumInstallments !== form.feesTotal) {
      toast.error(`Installment sum (₹${sumInstallments}) must equal course fee (₹${form.feesTotal})`);
      return;
    }

    createStudentMutation.mutate({
      ...form,
      enrollmentId: idGenerationType === "manual" ? form.enrollmentId : undefined,
      courseId: Number(form.courseId),
      batchId: Number(form.batchId),
      paymentType,
      installments: paymentType === "INSTALLMENT" ? installments : undefined,
    });
  };

  const handleEditOpen = (u: any) => {
    setEditStudent({
      id: u.id,
      name: u.name,
      countryCode: u.countryCode || "+91",
      countryISO: u.countryISO || "IN",
      phoneNumber: u.phoneNumber || "",
      email: u.email || "",
      status: u.status,
      course: u.profile?.course || "",
      batch: u.profile?.batch || "",
      feesTotal: parseFloat(u.profile?.feesTotal || "0"),
      completionDate: u.profile?.completionDate ? new Date(u.profile.completionDate).toISOString().split("T")[0] : "",
      gender: u.profile?.gender || "",
      dob: u.profile?.dob ? new Date(u.profile.dob).toISOString().split("T")[0] : "",
      educationalQualification: u.profile?.educationalQualification || "",
      parentName: u.profile?.parentName || "",
      parentPhone: u.profile?.parentPhone || "",
      parentCountryCode: u.profile?.parentCountryCode || "+91",
      parentCountryISO: u.profile?.parentCountryISO || "IN",
      parentPhoneNumber: u.profile?.parentPhoneNumber || "",
      notes: u.profile?.notes || "",
      enrollmentId: u.profile?.enrollmentId || "",
    });
    setEditOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStudent) return;
    const error = validatePhoneNumber(editStudent.countryCode, editStudent.phoneNumber, editStudent.countryISO);
    if (error) {
      toast.error(error);
      return;
    }
    updateStudentMutation.mutate({
      ...editStudent,
      dob: editStudent.dob || null,
      completionDate: editStudent.completionDate || null,
    });
  };

  const handleImport = () => {
    if (!csvData.trim()) return;
    importStudentsMutation.mutate({ csvData });
  };

  // Export to CSV function
  const handleExportCSV = () => {
    if (!studentsQuery.data?.items?.length) {
      toast.error("No students available to export");
      return;
    }
    const headers = ["Student ID", "Name", "Phone", "Email", "Course", "Batch", "Status", "Joined Date"];
    const rows = studentsQuery.data.items.map((s) => [
      s.profile?.enrollmentId || s.unionId,
      s.name,
      s.phone || "",
      s.email || "",
      s.profile?.course || "",
      s.profile?.batch || "",
      s.status,
      s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "",
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `students_export_${statusFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // UI status helpers
  const getStatusBadge = (status: string, completionDate?: Date | string | null) => {
    if (completionDate) {
      return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Alumni</Badge>;
    }
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Active</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      case "suspended":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Suspended</Badge>;
      case "on_hold":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">On Hold</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!isStaff) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Access restricted to staff members.</p>
      </div>
    );
  }

  const studentsList = studentsQuery.data?.items || [];
  const totalStudents = studentsQuery.data?.total || 0;
  const totalPages = Math.ceil(totalStudents / limit);

  return (
    <div className="space-y-6">
      {/* Top action cards & Search section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Students Management</h2>
          <p className="text-sm text-gray-500">View and manage Emtees student enrollment, profiles, and analytics.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV} className="text-gray-700 border-gray-200">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)} className="text-gray-700 border-gray-200">
                <Upload className="w-4 h-4 mr-2" />
                Bulk Import
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Student
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                  <DialogHeader className="pb-2 border-b">
                    <DialogTitle>Register New Student</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
                    <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-5 min-h-0">
                      
                      {/* Personal Details Section */}
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-emerald-800 uppercase tracking-wider">1. Personal Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Full Name <span className="text-red-500">*</span></label>
                            <Input placeholder="John Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
                            <label className="text-xs font-semibold text-gray-600">Email Address</label>
                            <Input placeholder="john@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-gray-600">Gender</label>
                              <select
                                className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm outline-none"
                                value={form.gender}
                                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                              >
                                <option value="">Select</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-gray-600">Date of Birth</label>
                              <Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Parent/Guardian Name</label>
                            <Input placeholder="Parent Name" value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} />
                          </div>
                          <PhoneNumberInput
                            label="Parent Phone Number"
                            countryCode={form.parentCountryCode}
                            countryISO={form.parentCountryISO}
                            value={form.parentPhoneNumber}
                            placeholder="Parent Phone"
                            onChange={(data) => setForm({
                              ...form,
                              parentCountryCode: data.countryCode,
                              parentCountryISO: data.countryISO,
                              parentPhoneNumber: data.phoneNumber,
                              parentPhone: data.fullNumber
                            })}
                          />
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-semibold text-gray-600">Educational Qualification</label>
                            <Input placeholder="B.Tech, Graduation, High School, etc." value={form.educationalQualification} onChange={(e) => setForm({ ...form, educationalQualification: e.target.value })} />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-semibold text-gray-600">Username <span className="text-red-500">*</span></label>
                            <Input placeholder="Username for LMS login" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-semibold text-gray-600">Password <span className="text-red-500">*</span></label>
                            <Input type="password" placeholder="LMS Login Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                          </div>
                        </div>
                      </div>

                      {/* Course & Batch Selection */}
                      <div className="space-y-3 pt-3 border-t">
                        <h3 className="text-sm font-semibold text-emerald-800 uppercase tracking-wider">2. Enrollment Info</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Student Enrollment ID</label>
                            <div className="flex gap-4 items-center mb-2">
                              <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                                <input
                                  type="radio"
                                  name="idGenType"
                                  value="auto"
                                  checked={idGenerationType === "auto"}
                                  onChange={() => setIdGenerationType("auto")}
                                />
                                Auto-Generate
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                                <input
                                  type="radio"
                                  name="idGenType"
                                  value="manual"
                                  checked={idGenerationType === "manual"}
                                  onChange={() => setIdGenerationType("manual")}
                                />
                                Manual Entry
                              </label>
                            </div>
                            {idGenerationType === "manual" && (
                              <Input
                                placeholder="e.g. STU1050"
                                value={form.enrollmentId}
                                onChange={(e) => setForm({ ...form, enrollmentId: e.target.value.toUpperCase() })}
                                required
                              />
                            )}
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Select Course <span className="text-red-500">*</span></label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm outline-none"
                              value={form.courseId}
                              onChange={(e) => handleCourseChange(e.target.value)}
                            >
                              <option value="">Select Course</option>
                              {activeCourses.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Select Batch <span className="text-red-500">*</span></label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm outline-none"
                              value={form.batchId}
                              onChange={(e) => handleBatchChange(e.target.value)}
                              disabled={!form.courseId}
                            >
                              <option value="">Select Batch</option>
                              {activeBatches.map((b: any) => (
                                <option key={b.id} value={b.id}>{b.name} (Fee: ₹{b.courseFee || "0"})</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">1-to-1 Sessions Allocated</label>
                            <Input type="number" value={form.allocatedOneToOneSessions} onChange={(e) => setForm({ ...form, allocatedOneToOneSessions: Number(e.target.value) })} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Group Sessions Allocated</label>
                            <Input type="number" value={form.allocatedGroupSessions} onChange={(e) => setForm({ ...form, allocatedGroupSessions: Number(e.target.value) })} />
                          </div>
                        </div>
                      </div>

                      {/* Payment Installment setup */}
                      <div className="space-y-3 pt-3 border-t">
                        <h3 className="text-sm font-semibold text-emerald-800 uppercase tracking-wider">3. Fee & Payment Setup</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Total Course Fee (₹)</label>
                            <Input type="number" value={form.feesTotal} onChange={(e) => handleFeesTotalChange(Number(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-600">Payment Type</label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm outline-none"
                              value={paymentType}
                              onChange={(e) => setPaymentType(e.target.value as any)}
                            >
                              <option value="FULL_PAYMENT">Full Payment upfront</option>
                              <option value="INSTALLMENT">Pay in Installments</option>
                            </select>
                          </div>

                          {paymentType === "INSTALLMENT" && (
                            <div className="md:col-span-2 space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-gray-700">Installments Setup</span>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-500">Count:</label>
                                  <select
                                    className="border rounded px-2 py-0.5 text-xs bg-white outline-none"
                                    value={installmentCount}
                                    onChange={(e) => handleInstallmentCountChange(Number(e.target.value))}
                                  >
                                    {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                </div>
                              </div>

                              <div className="space-y-2">
                                {installments.map((inst, index) => (
                                  <div key={index} className="flex flex-col sm:flex-row items-center gap-3 bg-white p-2 border rounded-lg">
                                    <span className="text-xs font-bold text-gray-500 w-28 shrink-0">Installment #{inst.installmentNumber}</span>
                                    <div className="flex items-center gap-1 w-full">
                                      <span className="text-gray-400 text-xs">₹</span>
                                      <Input
                                        type="number"
                                        className="h-8 text-xs font-mono"
                                        value={inst.amount}
                                        onChange={(e) => handleInstallmentAmountChange(index, Number(e.target.value))}
                                      />
                                    </div>
                                    <div className="flex items-center gap-2 w-full">
                                      <span className="text-gray-400 text-xs shrink-0">Due Date:</span>
                                      <Input
                                        type="date"
                                        className="h-8 text-xs"
                                        value={inst.dueDate}
                                        onChange={(e) => handleInstallmentDateChange(index, e.target.value)}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t mt-4">
                      <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={createStudentMutation.isPending || !form.name || !form.countryCode || !form.phoneNumber || !!validatePhoneNumber(form.countryCode, form.phoneNumber, form.countryISO) || !form.username || !form.password}>
                        {createStudentMutation.isPending ? "Creating student..." : "Create Student Account"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Tabs and Filters Section */}
      <div className="flex flex-col gap-4">
        <div className="border-b">
          <div className="flex gap-4">
            {(["all", "active", "inactive", "pending_enrollment", "alumni"] as const).map((status) => (
              <button
                key={status}
                onClick={() => { setStatusFilter(status); setPage(1); }}
                className={`py-3 px-1 text-sm font-semibold border-b-2 transition-all capitalize ${
                  statusFilter === status
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {status.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input className="pl-9 w-full" placeholder="Search ID, Name, Phone..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white w-full sm:w-48 outline-none"
            value={courseFilter}
            onChange={(e) => { setCourseFilter(e.target.value); setBatchFilter("all"); setPage(1); }}
          >
            <option value="all">All Courses</option>
            {activeCourses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white w-full sm:w-48 outline-none"
            value={batchFilter}
            onChange={(e) => { setBatchFilter(e.target.value); setPage(1); }}
            disabled={courseFilter === "all"}
          >
            <option value="all">All Batches</option>
            {filterBatches.map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Student List Table */}
      <Card className="border border-slate-100 shadow-sm rounded-xl overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Student ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentsList.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-slate-50/50"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("button") || target.closest("a")) return;
                    setDetailsStudentId(s.id);
                  }}
                >
                  <TableCell className="font-mono text-xs font-semibold text-emerald-800">{s.profile?.enrollmentId || s.unionId}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.phone}</TableCell>
                  <TableCell>{s.profile?.course || "-"}</TableCell>
                  <TableCell>{s.profile?.batch || "-"}</TableCell>
                  <TableCell>{getStatusBadge(s.status, s.profile?.completionDate)}</TableCell>
                  <TableCell>{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDetailsStudentId(s.id)}><Eye className="w-3.5 h-3.5" /></Button>
                      {isAdmin && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => handleEditOpen(s)}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setDeleteId(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {studentsList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-gray-500 py-10">
                    {studentsQuery.isLoading ? "Loading student records..." : "No student records found"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center pt-2">
          <span className="text-xs text-gray-500">Showing page {page} of {totalPages} ({totalStudents} total students)</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Import Students</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-xs text-gray-500 leading-relaxed">
              Paste CSV records in the format: <br />
              <code className="bg-slate-100 p-0.5 rounded text-xs font-mono font-bold">enrollmentId,name,phone,email,course,batch,feesTotal</code> <br />
              (enrollmentId is optional, leave empty to auto-generate).
            </p>
            <Textarea
              placeholder={"STU1050,Rahul Kumar,9876543210,rahul@example.com,IELTS Advanced,Batch A,15000\n,Ananya Sen,9876543211,,Spoken English,Batch B,12000"}
              value={csvData}
              onChange={(e) => setCsvData(e.target.value)}
              rows={8}
            />
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleImport} disabled={importStudentsMutation.isPending || !csvData.trim()}>
              {importStudentsMutation.isPending ? "Importing students..." : "Import Students Records"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Student Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This will permanently delete the student account, profile, all payments, and batch enrollments. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteId && deleteStudentMutation.mutate({ id: deleteId })}>Delete permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Student Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="pb-2 border-b"><DialogTitle>Edit Student Account</DialogTitle></DialogHeader>
          {editStudent && (
            <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-4 min-h-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-600">Full Name</label>
                    <Input value={editStudent.name} onChange={(e) => setEditStudent({ ...editStudent, name: e.target.value })} />
                  </div>
                  <PhoneNumberInput
                    label="Phone Number"
                    countryCode={editStudent.countryCode}
                    countryISO={editStudent.countryISO}
                    value={editStudent.phoneNumber}
                    onChange={(data) => setEditStudent({
                      ...editStudent,
                      countryCode: data.countryCode,
                      countryISO: data.countryISO,
                      phoneNumber: data.phoneNumber
                    })}
                  />
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-600">Email Address</label>
                    <Input value={editStudent.email} onChange={(e) => setEditStudent({ ...editStudent, email: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-600">Status</label>
                    <select
                      className="border rounded h-9 px-3 text-sm bg-white w-full"
                      value={editStudent.status}
                      onChange={(e) => setEditStudent({ ...editStudent, status: e.target.value as any })}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="suspended">Suspended</option>
                      <option value="on_hold">On Hold</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-600">Enrollment ID</label>
                    <Input
                      value={editStudent.enrollmentId || ""}
                      onChange={(e) => setEditStudent({ ...editStudent, enrollmentId: e.target.value.toUpperCase() })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-600">Course Name</label>
                    <Input value={editStudent.course} onChange={(e) => setEditStudent({ ...editStudent, course: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-600">Batch Name</label>
                    <Input value={editStudent.batch} onChange={(e) => setEditStudent({ ...editStudent, batch: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-600">Total Course Fee (₹)</label>
                    <Input type="number" value={editStudent.feesTotal} onChange={(e) => setEditStudent({ ...editStudent, feesTotal: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-600">Course Completion Date</label>
                    <Input type="date" value={editStudent.completionDate} onChange={(e) => setEditStudent({ ...editStudent, completionDate: e.target.value })} />
                  </div>
                </div>

                <div className="pt-2 border-t mt-2">
                  <h4 className="text-xs font-bold text-gray-700 mb-2">Personal & Parent Info</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">Gender</label>
                        <select
                          className="border rounded h-9 px-3 text-sm bg-white w-full"
                          value={editStudent.gender}
                          onChange={(e) => setEditStudent({ ...editStudent, gender: e.target.value })}
                        >
                          <option value="">Select</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">DOB</label>
                        <Input type="date" value={editStudent.dob} onChange={(e) => setEditStudent({ ...editStudent, dob: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500">Educational Qualification</label>
                      <Input value={editStudent.educationalQualification} onChange={(e) => setEditStudent({ ...editStudent, educationalQualification: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500">Parent/Guardian Name</label>
                      <Input value={editStudent.parentName} onChange={(e) => setEditStudent({ ...editStudent, parentName: e.target.value })} />
                    </div>
                    <PhoneNumberInput
                      label="Parent Phone Number"
                      countryCode={editStudent.parentCountryCode}
                      countryISO={editStudent.parentCountryISO}
                      value={editStudent.parentPhoneNumber}
                      placeholder="Parent Phone"
                      onChange={(data) => setEditStudent({
                        ...editStudent,
                        parentCountryCode: data.countryCode,
                        parentCountryISO: data.countryISO,
                        parentPhoneNumber: data.phoneNumber,
                        parentPhone: data.fullNumber
                      })}
                    />
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs text-gray-500">Admin Notes</label>
                      <Textarea value={editStudent.notes} onChange={(e) => setEditStudent({ ...editStudent, notes: e.target.value })} rows={2} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t mt-4">
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={updateStudentMutation.isPending}>
                  {updateStudentMutation.isPending ? "Saving changes..." : "Save Student Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Student Profile Details Dialog */}
      <Dialog open={!!detailsStudentId} onOpenChange={(open) => !open && setDetailsStudentId(null)}>
        <DialogContent className="w-[95vw] md:max-w-5xl max-h-[90vh] flex flex-col overflow-hidden p-6">
          <DialogHeader className="pb-3 border-b">
            <div className="flex justify-between items-start w-full">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-gray-800">
                  <User className="w-5 h-5 text-emerald-600" />
                  {profileQuery.data?.student ? profileQuery.data.student.name : "Student Profile"}
                </DialogTitle>
                {profileQuery.data?.student && (
                  <p className="text-xs text-gray-400 font-mono font-bold mt-1">
                    Student ID: {profileQuery.data.student.profile?.enrollmentId || profileQuery.data.student.unionId}
                  </p>
                )}
              </div>
              {profileQuery.data?.student && getStatusBadge(profileQuery.data.student.status, profileQuery.data.student.profile?.completionDate)}
            </div>
          </DialogHeader>

          {profileQuery.isLoading ? (
            <div className="py-20 text-center text-gray-500">Loading student profile...</div>
          ) : profileQuery.data ? (
            <Tabs defaultValue="personal" className="flex-1 flex flex-col min-h-0 mt-4">
              <TabsList className="flex w-full items-center justify-start gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4 text-xs font-semibold overflow-x-auto no-scrollbar scroll-smooth select-none">
                <TabsTrigger value="personal" className="flex-none px-4 py-2 rounded-lg transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/30 hover:text-slate-800 dark:hover:text-slate-200">Personal</TabsTrigger>
                <TabsTrigger value="course" className="flex-none px-4 py-2 rounded-lg transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/30 hover:text-slate-800 dark:hover:text-slate-200">Course & Batches</TabsTrigger>
                <TabsTrigger value="attendance" className="flex-none px-4 py-2 rounded-lg transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/30 hover:text-slate-800 dark:hover:text-slate-200">Attendance</TabsTrigger>
                <TabsTrigger value="fees" className="flex-none px-4 py-2 rounded-lg transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/30 hover:text-slate-800 dark:hover:text-slate-200">Fees & Payments</TabsTrigger>
                <TabsTrigger value="performance" className="flex-none px-4 py-2 rounded-lg transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/30 hover:text-slate-800 dark:hover:text-slate-200">Performance</TabsTrigger>
                <TabsTrigger value="documents" className="flex-none px-4 py-2 rounded-lg transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/30 hover:text-slate-800 dark:hover:text-slate-200">Documents</TabsTrigger>
                <TabsTrigger value="communication" className="flex-none px-4 py-2 rounded-lg transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/30 hover:text-slate-800 dark:hover:text-slate-200">Chat History</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto pr-1 min-h-0">
                {/* 1. Personal Details Tab */}
                <TabsContent value="personal" className="space-y-4 outline-none">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-slate-100 shadow-sm bg-slate-50/50">
                      <CardHeader className="py-3 bg-slate-50 border-b"><CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Personal Information</CardTitle></CardHeader>
                      <CardContent className="p-4 space-y-2 text-sm text-slate-600">
                        <p><strong>Email:</strong> {profileQuery.data.student.email || "-"}</p>
                        <p><strong>Phone:</strong> {profileQuery.data.student.phone || "-"}</p>
                        <p><strong>Gender:</strong> <span className="capitalize">{profileQuery.data.student.profile?.gender || "-"}</span></p>
                        <p><strong>DOB:</strong> {profileQuery.data.student.profile?.dob ? new Date(profileQuery.data.student.profile.dob).toLocaleDateString() : "-"}</p>
                        <p><strong>Education:</strong> {profileQuery.data.student.profile?.educationalQualification || "-"}</p>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-100 shadow-sm bg-slate-50/50">
                      <CardHeader className="py-3 bg-slate-50 border-b"><CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Parent / Guardian Info</CardTitle></CardHeader>
                      <CardContent className="p-4 space-y-2 text-sm text-slate-600">
                        <p><strong>Parent Name:</strong> {profileQuery.data.student.profile?.parentName || "-"}</p>
                        <p><strong>Parent Phone:</strong> {profileQuery.data.student.profile?.parentPhone || "-"}</p>
                      </CardContent>
                    </Card>

                    <Card className="md:col-span-2 border-slate-100 shadow-sm bg-slate-50/50">
                      <CardHeader className="py-3 bg-slate-50 border-b"><CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Additional Profile Info</CardTitle></CardHeader>
                      <CardContent className="p-4 space-y-2 text-sm text-slate-600">
                        <p><strong>LMS Username:</strong> <span className="font-mono text-xs bg-slate-100 px-1 rounded">{profileQuery.data.student.username}</span></p>
                        <p><strong>Enrollment Date:</strong> {profileQuery.data.student.profile?.admissionDate ? new Date(profileQuery.data.student.profile.admissionDate).toLocaleDateString() : "-"}</p>
                        <p><strong>Completion Date:</strong> {profileQuery.data.student.profile?.completionDate ? new Date(profileQuery.data.student.profile.completionDate).toLocaleDateString() : "Ongoing study"}</p>
                        <p><strong>Admin Notes:</strong> {profileQuery.data.student.profile?.notes || "No notes registered."}</p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* 2. Course & Batch Info Tab */}
                <TabsContent value="course" className="space-y-6 outline-none">
                  {(() => {
                    const activeEnrollment = profileQuery.data.enrollments?.find((e: any) => e.status === "active") || profileQuery.data.enrollments?.[0];
                    const teachersAvailability = teachersAvailabilityQuery.data || [];
                    const classHistory = profileQuery.data.classHistory || [];
                    const auditLogs = profileQuery.data.studentCourseAuditLogs || [];
                    const config = profileQuery.data.student.profile?.packageConfig as any;

                    // Calculate stats
                    const completedCount = classHistory.filter((c: any) => c.status === "completed").length;
                    const missedCount = classHistory.filter((c: any) => c.status === "absent").length;
                    const cancelledCount = classHistory.filter((c: any) => c.status === "cancelled").length;
                    const totalAllocated = profileQuery.data.student.profile?.totalAllocatedSessions || 0;
                    const totalRemaining = profileQuery.data.student.profile?.totalRemainingSessions || 0;
                    const pct = totalAllocated > 0 ? Math.min(100, Math.round((completedCount / totalAllocated) * 100)) : 0;

                    // Teacher Names helper
                    const teacherNames = activeEnrollment?.resolvedTeachers?.length > 0 
                      ? activeEnrollment.resolvedTeachers.map((t: any) => t.name).join(", ") 
                      : (activeEnrollment?.batch?.teacher?.name || "Unassigned");

                    // Start Date & End Date helpers
                    const startDateStr = activeEnrollment?.batch?.startDate 
                      ? new Date(activeEnrollment.batch.startDate).toLocaleDateString() 
                      : (profileQuery.data.student.profile?.admissionDate 
                        ? new Date(profileQuery.data.student.profile.admissionDate).toLocaleDateString() 
                        : "-");

                    const getEndDate = (startDate: any, durationStr: string) => {
                      if (!startDate) return "-";
                      const date = new Date(startDate);
                      const durMatch = durationStr?.match(/(\d+)\s*(month|week|day)/i);
                      if (durMatch) {
                        const num = parseInt(durMatch[1]);
                        const unit = durMatch[2].toLowerCase();
                        if (unit.startsWith("month")) date.setMonth(date.getMonth() + num);
                        else if (unit.startsWith("week")) date.setDate(date.getDate() + num * 7);
                        else if (unit.startsWith("day")) date.setDate(date.getDate() + num);
                      } else {
                        date.setMonth(date.getMonth() + 3);
                      }
                      return date.toLocaleDateString();
                    };

                    const endDateStr = activeEnrollment?.batch?.startDate 
                      ? getEndDate(activeEnrollment.batch.startDate, activeEnrollment.batch.duration || "3 months")
                      : "-";

                    return (
                      <div className="space-y-6">
                        {/* 1. Course Information & Batch Control */}
                        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
                          <CardHeader className="bg-slate-50 border-b py-3 px-4 flex flex-row items-center justify-between">
                            <div className="flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-emerald-600" />
                              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Course Information</CardTitle>
                            </div>
                            {isAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                                onClick={() => {
                                  if (!batchChangeMode) {
                                    setNewBatchCourseId(activeEnrollment?.batch?.moduleId || "");
                                    setNewBatchId(activeEnrollment?.batchId || "");
                                  }
                                  setBatchChangeMode(!batchChangeMode);
                                }}
                              >
                                {batchChangeMode ? "Cancel Change" : "Change Batch / Course"}
                              </Button>
                            )}
                          </CardHeader>
                          <CardContent className="p-4">
                            {batchChangeMode ? (
                              <div className="space-y-4">
                                <h4 className="text-sm font-semibold text-slate-800">Transfer Student to New Batch</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500">Select New Course</label>
                                    <select
                                      value={newBatchCourseId}
                                      onChange={(e) => {
                                        setNewBatchCourseId(e.target.value ? Number(e.target.value) : "");
                                        setNewBatchId("");
                                      }}
                                      className="w-full rounded-lg border border-slate-200 p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    >
                                      <option value="">Select Course</option>
                                      {activeCoursesQuery.data?.map((c: any) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500">Select New Batch</label>
                                    <select
                                      value={newBatchId}
                                      onChange={(e) => setNewBatchId(e.target.value ? Number(e.target.value) : "")}
                                      className="w-full rounded-lg border border-slate-200 p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                      disabled={!newBatchCourseId}
                                    >
                                      <option value="">Select Batch</option>
                                      {(activeCoursesQuery.data?.find((c: any) => c.id === newBatchCourseId)?.batches?.filter((b: any) => b.status === "active") || []).map((b: any) => (
                                        <option key={b.id} value={b.id}>{b.name} ({b.timeSlot || "No Time"})</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <Button size="sm" variant="outline" onClick={() => setBatchChangeMode(false)}>Cancel</Button>
                                  <Button 
                                    size="sm" 
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white" 
                                    disabled={changeBatchMutation.isPending || !newBatchId}
                                    onClick={() => changeBatchMutation.mutate({ studentId: profileQuery.data.student.id, newBatchId: Number(newBatchId) })}
                                  >
                                    {changeBatchMutation.isPending ? "Transferring..." : "Confirm Batch Change"}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                <div className="space-y-0.5">
                                  <p className="text-xs text-gray-400 font-semibold">Course Name</p>
                                  <p className="font-semibold text-slate-800">{activeEnrollment?.batch?.module?.name || profileQuery.data.student.profile?.course || "-"}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-xs text-gray-400 font-semibold">Batch Name</p>
                                  <p className="font-semibold text-slate-800">{activeEnrollment?.batch?.name || profileQuery.data.student.profile?.batch || "-"}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-xs text-gray-400 font-semibold">Assigned Teacher(s)</p>
                                  <p className="font-semibold text-slate-800">{teacherNames}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-xs text-gray-400 font-semibold">Course Start Date</p>
                                  <p className="font-semibold text-slate-800">{startDateStr}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-xs text-gray-400 font-semibold">Course End Date</p>
                                  <p className="font-semibold text-slate-800">{endDateStr}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-xs text-gray-400 font-semibold">Course Status</p>
                                  <div>
                                    <Badge className={`capitalize font-bold ${
                                      activeEnrollment?.status === "active"
                                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                        : activeEnrollment?.status === "restricted"
                                          ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                          : "bg-slate-100 text-slate-600 hover:bg-slate-100"
                                    }`}>
                                      {activeEnrollment?.status || "inactive"}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* 2. Class Allocation & Package Details */}
                        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
                          <CardHeader className="bg-slate-50 border-b py-3 px-4 flex flex-row items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Settings className="w-4 h-4 text-emerald-600" />
                              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Class Allocation & Package Details</CardTitle>
                            </div>
                            {isAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                                onClick={() => {
                                  if (!packageEditMode) {
                                    setPackageForm({
                                      oneToOne: {
                                        total: config?.oneToOne?.total ?? profileQuery.data.student.profile?.allocatedOneToOneSessions ?? 0,
                                        min30: config?.oneToOne?.min30 ?? 0,
                                        min45: config?.oneToOne?.min45 ?? 0,
                                        min60: config?.oneToOne?.min60 ?? 0,
                                      },
                                      group: {
                                        total: config?.group?.total ?? profileQuery.data.student.profile?.allocatedGroupSessions ?? 0,
                                        min30: config?.group?.min30 ?? 0,
                                        min45: config?.group?.min45 ?? 0,
                                        min60: config?.group?.min60 ?? 0,
                                      }
                                    });
                                  }
                                  setPackageEditMode(!packageEditMode);
                                }}
                              >
                                {packageEditMode ? "Cancel Edit" : "Configure Package"}
                              </Button>
                            )}
                          </CardHeader>
                          <CardContent className="p-4">
                            {packageEditMode ? (
                              <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {/* One-to-One edit block */}
                                  <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                                    <h4 className="font-semibold text-xs text-slate-700 uppercase tracking-wider">One-to-One Sessions</h4>
                                    <div className="space-y-1">
                                      <label className="text-xs text-slate-500 font-medium">Total One-to-One Classes</label>
                                      <Input
                                        type="number"
                                        className="h-9 bg-white"
                                        value={packageForm.oneToOne.total}
                                        onChange={(e) => setPackageForm({
                                          ...packageForm,
                                          oneToOne: { ...packageForm.oneToOne, total: Number(e.target.value) }
                                        })}
                                      />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                      <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-semibold uppercase">30 Min Classes</label>
                                        <Input
                                          type="number"
                                          className="h-8 text-xs bg-white"
                                          value={packageForm.oneToOne.min30}
                                          onChange={(e) => setPackageForm({
                                            ...packageForm,
                                            oneToOne: { ...packageForm.oneToOne, min30: Number(e.target.value) }
                                          })}
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-semibold uppercase">45 Min Classes</label>
                                        <Input
                                          type="number"
                                          className="h-8 text-xs bg-white"
                                          value={packageForm.oneToOne.min45}
                                          onChange={(e) => setPackageForm({
                                            ...packageForm,
                                            oneToOne: { ...packageForm.oneToOne, min45: Number(e.target.value) }
                                          })}
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-semibold uppercase">60 Min Classes</label>
                                        <Input
                                          type="number"
                                          className="h-8 text-xs bg-white"
                                          value={packageForm.oneToOne.min60}
                                          onChange={(e) => setPackageForm({
                                            ...packageForm,
                                            oneToOne: { ...packageForm.oneToOne, min60: Number(e.target.value) }
                                          })}
                                        />
                                      </div>
                                    </div>
                                    <p className="text-[10px] text-right font-medium text-slate-500">
                                      Sum: {packageForm.oneToOne.min30 + packageForm.oneToOne.min45 + packageForm.oneToOne.min60} / {packageForm.oneToOne.total}
                                    </p>
                                  </div>

                                  {/* Group edit block */}
                                  <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                                    <h4 className="font-semibold text-xs text-slate-700 uppercase tracking-wider">Group Sessions</h4>
                                    <div className="space-y-1">
                                      <label className="text-xs text-slate-500 font-medium">Total Group Classes</label>
                                      <Input
                                        type="number"
                                        className="h-9 bg-white"
                                        value={packageForm.group.total}
                                        onChange={(e) => setPackageForm({
                                          ...packageForm,
                                          group: { ...packageForm.group, total: Number(e.target.value) }
                                        })}
                                      />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                      <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-semibold uppercase">30 Min Classes</label>
                                        <Input
                                          type="number"
                                          className="h-8 text-xs bg-white"
                                          value={packageForm.group.min30}
                                          onChange={(e) => setPackageForm({
                                            ...packageForm,
                                            group: { ...packageForm.group, min30: Number(e.target.value) }
                                          })}
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-semibold uppercase">45 Min Classes</label>
                                        <Input
                                          type="number"
                                          className="h-8 text-xs bg-white"
                                          value={packageForm.group.min45}
                                          onChange={(e) => setPackageForm({
                                            ...packageForm,
                                            group: { ...packageForm.group, min45: Number(e.target.value) }
                                          })}
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-semibold uppercase">60 Min Classes</label>
                                        <Input
                                          type="number"
                                          className="h-8 text-xs bg-white"
                                          value={packageForm.group.min60}
                                          onChange={(e) => setPackageForm({
                                            ...packageForm,
                                            group: { ...packageForm.group, min60: Number(e.target.value) }
                                          })}
                                        />
                                      </div>
                                    </div>
                                    <p className="text-[10px] text-right font-medium text-slate-500">
                                      Sum: {packageForm.group.min30 + packageForm.group.min45 + packageForm.group.min60} / {packageForm.group.total}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex gap-2 justify-end">
                                  <Button size="sm" variant="outline" onClick={() => setPackageEditMode(false)}>Cancel</Button>
                                  <Button
                                    size="sm"
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    disabled={updatePackageMutation.isPending}
                                    onClick={() => {
                                      const o2oSum = packageForm.oneToOne.min30 + packageForm.oneToOne.min45 + packageForm.oneToOne.min60;
                                      const gSum = packageForm.group.min30 + packageForm.group.min45 + packageForm.group.min60;
                                      if (o2oSum !== packageForm.oneToOne.total) {
                                        toast.error("One-to-One split sum does not match One-to-One total.");
                                        return;
                                      }
                                      if (gSum !== packageForm.group.total) {
                                        toast.error("Group split sum does not match Group total.");
                                        return;
                                      }
                                      updatePackageMutation.mutate({
                                        studentId: profileQuery.data.student.id,
                                        packageConfig: packageForm,
                                      });
                                    }}
                                  >
                                    {updatePackageMutation.isPending ? "Saving..." : "Save Package Config"}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/30">
                                  <h4 className="font-bold text-xs text-slate-600 uppercase tracking-wider mb-2">One-to-One Sessions Breakdowns</h4>
                                  <div className="space-y-1 text-sm">
                                    <div className="flex justify-between border-b pb-1 border-slate-100">
                                      <span className="text-gray-500">Allocated One-to-One</span>
                                      <span className="font-bold text-slate-800">{profileQuery.data.student.profile?.allocatedOneToOneSessions ?? 0} Classes</span>
                                    </div>
                                    <div className="flex justify-between text-xs pt-1">
                                      <span className="text-gray-400">30 Min Sessions</span>
                                      <span className="font-semibold text-slate-700">{config?.oneToOne?.min30 || 0} Classes</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-gray-400">45 Min Sessions</span>
                                      <span className="font-semibold text-slate-700">{config?.oneToOne?.min45 || 0} Classes</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-gray-400">60 Min Sessions</span>
                                      <span className="font-semibold text-slate-700">{config?.oneToOne?.min60 || 0} Classes</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/30">
                                  <h4 className="font-bold text-xs text-slate-600 uppercase tracking-wider mb-2">Group Sessions Breakdowns</h4>
                                  <div className="space-y-1 text-sm">
                                    <div className="flex justify-between border-b pb-1 border-slate-100">
                                      <span className="text-gray-500">Allocated Group</span>
                                      <span className="font-bold text-slate-800">{profileQuery.data.student.profile?.allocatedGroupSessions ?? 0} Classes</span>
                                    </div>
                                    <div className="flex justify-between text-xs pt-1">
                                      <span className="text-gray-400">30 Min Sessions</span>
                                      <span className="font-semibold text-slate-700">{config?.group?.min30 || 0} Classes</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-gray-400">45 Min Sessions</span>
                                      <span className="font-semibold text-slate-700">{config?.group?.min45 || 0} Classes</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-gray-400">60 Min Sessions</span>
                                      <span className="font-semibold text-slate-700">{config?.group?.min60 || 0} Classes</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* 3. Teacher Assignment */}
                        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
                          <CardHeader className="bg-slate-50 border-b py-3 px-4 flex flex-row items-center justify-between">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-emerald-600" />
                              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Teacher Assignment Management</CardTitle>
                            </div>
                            {isAdmin && activeEnrollment && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                                onClick={() => {
                                  if (!teacherAssignMode) {
                                    const currentIds = activeEnrollment.assignedTeachers && Array.isArray(activeEnrollment.assignedTeachers)
                                      ? activeEnrollment.assignedTeachers as number[]
                                      : [];
                                    setAssignTeachersForm(currentIds);
                                    teachersAvailabilityQuery.refetch();
                                  }
                                  setTeacherAssignMode(!teacherAssignMode);
                                }}
                              >
                                {teacherAssignMode ? "Cancel" : "Manage Teachers"}
                              </Button>
                            )}
                          </CardHeader>
                          <CardContent className="p-4">
                            {teacherAssignMode ? (
                              <div className="space-y-4">
                                <h4 className="text-sm font-semibold text-slate-800">Assign Multiple Teachers for Enrolled Course</h4>
                                {teachersAvailabilityQuery.isLoading ? (
                                  <p className="text-xs text-slate-400 text-center py-4">Loading active teachers...</p>
                                ) : (
                                  <div className="border border-slate-100 rounded-lg bg-white overflow-hidden text-xs max-h-60 overflow-y-auto">
                                    <Table>
                                      <TableHeader className="bg-slate-50">
                                        <TableRow>
                                          <TableHead className="w-12 text-center">Select</TableHead>
                                          <TableHead>Teacher Name</TableHead>
                                          <TableHead className="text-center">Active Students</TableHead>
                                          <TableHead className="text-center">Assigned Sessions</TableHead>
                                          <TableHead className="text-center">Workload Status</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {teachersAvailability.map((t: any) => {
                                          const isChecked = assignTeachersForm.includes(t.id);
                                          const overLimit = t.activeStudentsCount >= 15;
                                          return (
                                            <TableRow key={t.id} className={isChecked ? "bg-slate-50/50" : ""}>
                                              <TableCell className="text-center">
                                                <input
                                                  type="checkbox"
                                                  checked={isChecked}
                                                  onChange={(e) => {
                                                    if (e.target.checked) {
                                                      setAssignTeachersForm([...assignTeachersForm, t.id]);
                                                    } else {
                                                      setAssignTeachersForm(assignTeachersForm.filter(id => id !== t.id));
                                                    }
                                                  }}
                                                  className="w-3.5 h-3.5 text-emerald-600 focus:ring-emerald-500 border-slate-300 rounded"
                                                />
                                              </TableCell>
                                              <TableCell className="font-semibold text-slate-800 flex flex-col justify-center">
                                                <span>{t.name}</span>
                                                {overLimit && isChecked && (
                                                  <span className="text-[9px] text-amber-600 font-bold flex items-center gap-0.5 mt-0.5">
                                                    <AlertTriangle className="w-3 h-3 text-amber-500" /> Over capacity warning (&gt;15 students)
                                                  </span>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-center font-mono">{t.activeStudentsCount} / 15</TableCell>
                                              <TableCell className="text-center font-mono">{t.assignedSessionsCount}</TableCell>
                                              <TableCell className="text-center">
                                                <Badge className={`font-bold ${
                                                  t.availabilityStatus === "Overloaded"
                                                    ? "bg-red-100 text-red-700"
                                                    : t.availabilityStatus === "Busy"
                                                      ? "bg-amber-100 text-amber-700"
                                                      : "bg-emerald-100 text-emerald-700"
                                                }`}>
                                                  {t.availabilityStatus}
                                                </Badge>
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                        {teachersAvailability.length === 0 && (
                                          <TableRow>
                                            <TableCell colSpan={5} className="text-center text-slate-400 py-6">
                                              No active teachers found.
                                            </TableCell>
                                          </TableRow>
                                        )}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                                <div className="flex gap-2 justify-end">
                                  <Button size="sm" variant="outline" onClick={() => setTeacherAssignMode(false)}>Cancel</Button>
                                  <Button
                                    size="sm"
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    disabled={updateTeacherAssignmentMutation.isPending}
                                    onClick={() => {
                                      updateTeacherAssignmentMutation.mutate({
                                        studentId: profileQuery.data.student.id,
                                        enrollmentId: activeEnrollment.id,
                                        teacherIds: assignTeachersForm
                                      });
                                    }}
                                  >
                                    {updateTeacherAssignmentMutation.isPending ? "Saving..." : "Save Teacher Assignment"}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/30">
                                  <div className="flex items-start gap-4">
                                    <div className="bg-emerald-50 text-emerald-700 p-2.5 rounded-lg">
                                      <User className="w-5 h-5" />
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Assigned Teacher(s) for Student</p>
                                      <p className="text-base font-bold text-slate-800">{teacherNames}</p>
                                      {activeEnrollment?.resolvedTeachers && activeEnrollment.resolvedTeachers.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                          {activeEnrollment.resolvedTeachers.map((t: any) => (
                                            <Badge key={t.id} variant="outline" className="bg-white border-slate-200 text-xs font-semibold px-2 py-0.5 text-slate-700">
                                              {t.name}
                                            </Badge>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-gray-400 italic mt-0.5">Assigned to batch default teacher</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* 4. Live Tracking (Progress) */}
                        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
                          <CardHeader className="bg-slate-50 border-b py-3 px-4 flex flex-row items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-emerald-600" />
                              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Live Package Tracking & Statistics</CardTitle>
                            </div>
                          </CardHeader>
                          <CardContent className="p-4 space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Allocated</p>
                                <p className="text-2xl font-bold text-slate-800">{totalAllocated}</p>
                              </div>
                              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Classes Attended</p>
                                <p className="text-2xl font-bold text-emerald-700">{completedCount}</p>
                              </div>
                              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Classes Missed</p>
                                <p className="text-2xl font-bold text-red-600">{missedCount}</p>
                              </div>
                              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Classes Cancelled</p>
                                <p className="text-2xl font-bold text-slate-500">{cancelledCount}</p>
                              </div>
                              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 col-span-2 md:col-span-1">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Remaining Classes</p>
                                <p className="text-2xl font-bold text-blue-700">{totalRemaining}</p>
                              </div>
                            </div>

                            <div className="space-y-1.5 pt-2">
                              <div className="flex justify-between text-xs font-bold text-slate-700">
                                <span>Package Completion Progress</span>
                                <span>{completedCount} / {totalAllocated} Classes ({pct}%)</span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                                <div className="bg-emerald-600 h-3 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        {/* 5. Session History */}
                        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
                          <CardHeader className="bg-slate-50 border-b py-3 px-4">
                            <div className="flex items-center gap-2">
                              <History className="w-4 h-4 text-emerald-600" />
                              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Class & Session History</CardTitle>
                            </div>
                          </CardHeader>
                          <CardContent className="p-0 overflow-x-auto text-xs">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="font-semibold text-xs">Type</TableHead>
                                  <TableHead className="font-semibold text-xs">Title / Topic</TableHead>
                                  <TableHead className="font-semibold text-xs">Duration</TableHead>
                                  <TableHead className="font-semibold text-xs">Teacher</TableHead>
                                  <TableHead className="font-semibold text-xs">Date & Time</TableHead>
                                  <TableHead className="font-semibold text-xs text-center">Status</TableHead>
                                  <TableHead className="font-semibold text-xs">Notes</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {classHistory.map((rec: any) => (
                                  <TableRow key={rec.id}>
                                    <TableCell className="font-semibold capitalize">
                                      <Badge variant="outline" className={rec.sessionType === "one_to_one" ? "border-emerald-200 text-emerald-800 bg-emerald-50/30" : "border-blue-200 text-blue-800 bg-blue-50/30"}>
                                        {rec.sessionType === "one_to_one" ? "1-to-1" : "Group"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="font-medium max-w-[150px] truncate" title={rec.title}>{rec.title}</TableCell>
                                    <TableCell className="font-mono text-gray-500">{rec.duration} mins</TableCell>
                                    <TableCell>{rec.teacherName}</TableCell>
                                    <TableCell className="font-mono text-gray-500">{new Date(rec.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                                    <TableCell className="text-center">
                                      <Badge className={`capitalize font-bold ${
                                        rec.status === "completed"
                                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                          : rec.status === "absent"
                                            ? "bg-red-100 text-red-700 hover:bg-red-100"
                                            : rec.status === "cancelled"
                                              ? "bg-slate-100 text-slate-600 hover:bg-slate-100"
                                              : rec.status === "rescheduled"
                                                ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                                : "bg-blue-100 text-blue-700 hover:bg-blue-100"
                                      }`}>
                                        {rec.status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-gray-400 max-w-[150px] truncate" title={rec.notes}>{rec.notes || "-"}</TableCell>
                                  </TableRow>
                                ))}
                                {classHistory.length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={7} className="text-center text-slate-400 py-10">
                                      No session history logs found.
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>

                        {/* 6. Audit Log */}
                        <Card className="border-slate-200/80 shadow-sm overflow-hidden">
                          <CardHeader className="bg-slate-50 border-b py-3 px-4">
                            <div className="flex items-center gap-2">
                              <History className="w-4 h-4 text-emerald-600" />
                              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Course & Class Allocation Audit Trail</CardTitle>
                            </div>
                          </CardHeader>
                          <CardContent className="p-0 overflow-x-auto text-xs">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="font-semibold text-xs">Date & Time</TableHead>
                                  <TableHead className="font-semibold text-xs">Event Type</TableHead>
                                  <TableHead className="font-semibold text-xs">Previous Value</TableHead>
                                  <TableHead className="font-semibold text-xs">New Value</TableHead>
                                  <TableHead className="font-semibold text-xs">Changed By</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {auditLogs.map((log: any) => (
                                  <TableRow key={log.id}>
                                    <TableCell className="font-mono text-gray-500">{new Date(log.changedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                                    <TableCell className="font-semibold capitalize text-slate-700">
                                      <Badge variant="outline" className="border-slate-300 text-slate-700 bg-slate-50">
                                        {log.changeType.replace(/_/g, " ")}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-red-600 font-mono" title={log.oldValue}>{log.oldValue || "-"}</TableCell>
                                    <TableCell className="text-emerald-700 font-mono font-semibold" title={log.newValue}>{log.newValue || "-"}</TableCell>
                                    <TableCell className="font-medium">{log.changedByUser?.name || "Admin"}</TableCell>
                                  </TableRow>
                                ))}
                                {auditLogs.length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={5} className="text-center text-slate-400 py-6">
                                      No audit log trails found.
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })()}
                </TabsContent>

                {/* 3. Attendance Summary Tab */}
                <TabsContent value="attendance" className="space-y-4 outline-none">
                  <div className="border rounded-xl overflow-hidden bg-white text-xs">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="font-semibold text-xs">Date</TableHead>
                          <TableHead className="font-semibold text-xs">Class Title / Topic</TableHead>
                          <TableHead className="font-semibold text-xs">Batch</TableHead>
                          <TableHead className="font-semibold text-xs text-center">Attendance Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profileQuery.data.attendance.map((rec) => (
                          <TableRow key={rec.id}>
                            <TableCell className="font-mono text-gray-500">{rec.class?.scheduledAt ? new Date(rec.class.scheduledAt).toLocaleDateString() : "-"}</TableCell>
                            <TableCell className="font-medium">{rec.class?.title || "Live Class"}</TableCell>
                            <TableCell>{profileQuery.data.student.profile?.batch}</TableCell>
                            <TableCell className="text-center">
                              <Badge className={
                                rec.status === "present"
                                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                  : rec.status === "late"
                                    ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                    : "bg-red-100 text-red-700 hover:bg-red-100"
                              }>
                                {rec.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        {profileQuery.data.attendance.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-slate-400 py-10">
                              No attendance records registered.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* 4. Fee & Payment Details Tab */}
                <TabsContent value="fees" className="space-y-4 outline-none">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <Card className="border-slate-100 bg-slate-50/30">
                      <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-gray-500">Total Course Fee</CardTitle></CardHeader>
                      <CardContent><p className="text-lg font-bold text-gray-800">₹{profileQuery.data.student.profile?.feesTotal || "0"}</p></CardContent>
                    </Card>
                    <Card className="border-slate-100 bg-slate-50/30">
                      <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-gray-500">Amount Paid</CardTitle></CardHeader>
                      <CardContent><p className="text-lg font-bold text-emerald-700">₹{profileQuery.data.student.profile?.feesPaid || "0"}</p></CardContent>
                    </Card>
                    <Card className="border-slate-100 bg-slate-50/30">
                      <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-gray-500">Outstanding Balance</CardTitle></CardHeader>
                      <CardContent><p className="text-lg font-bold text-red-600">₹{profileQuery.data.student.profile?.feesBalance || "0"}</p></CardContent>
                    </Card>
                    <Card className="border-slate-100 bg-slate-50/30">
                      <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-gray-500">Payment Status</CardTitle></CardHeader>
                      <CardContent>
                        <Badge className={`capitalize font-bold ${
                          profileQuery.data.student.profile?.paymentStatus === "paid"
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                            : profileQuery.data.student.profile?.paymentStatus === "partial"
                              ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                              : "bg-red-100 text-red-700 hover:bg-red-100"
                        }`}>
                          {profileQuery.data.student.profile?.paymentStatus || "unpaid"}
                        </Badge>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {/* Installments Table */}
                    <Card className="border-slate-100">
                      <CardHeader className="py-3 border-b bg-slate-50/50"><CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Tuition Installments & Payments</CardTitle></CardHeader>
                      <CardContent className="p-0 overflow-x-auto text-xs">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Inst #</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Due Date</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {profileQuery.data.payments.map((p) => (
                              <TableRow key={p.id}>
                                <TableCell className="font-bold">
                                  {p.installmentNumber ? `Installment #${p.installmentNumber}` : "Single Tuition"}
                                </TableCell>
                                <TableCell className="font-mono font-semibold">₹{p.amount}</TableCell>
                                <TableCell className="font-mono text-gray-500">{p.dueDate ? new Date(p.dueDate).toLocaleDateString() : "N/A"}</TableCell>
                                <TableCell>
                                  <Badge className={
                                    p.status === "paid"
                                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                      : "bg-red-100 text-red-700 hover:bg-red-100"
                                  }>
                                    {p.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  {isAdmin && p.status !== "paid" ? (
                                    <Button size="sm" variant="outline" className="h-7 text-[10px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100" onClick={() => recordPaymentMutation.mutate({ paymentId: p.id, amount: Number(p.amount) })}>
                                      Record Pay
                                    </Button>
                                  ) : "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                            {profileQuery.data.payments.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-slate-400 py-6">
                                  No installments generated.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>

                    {/* Adjust Fees Card (Admin only) */}
                    {isAdmin && (
                      <Card className="border border-dashed border-slate-200 bg-slate-50/50 p-4 flex flex-col justify-between">
                        <div className="space-y-4">
                          <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Configure Student Fee Rules</h4>
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <label className="text-xs text-gray-500">Minimum Initial Payment (₹)</label>
                              <Input
                                type="number"
                                value={feeForm.minInitialPayment}
                                onChange={(e) => setFeeForm({ ...feeForm, minInitialPayment: Number(e.target.value) })}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-gray-500">Payment Due Date</label>
                              <Input
                                type="date"
                                value={feeForm.paymentDueDate}
                                onChange={(e) => setFeeForm({ ...feeForm, paymentDueDate: e.target.value })}
                              />
                            </div>
                          </div>
                        </div>
                        <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-4 h-9 text-xs" onClick={() => {
                          adjustFeesMutation.mutate({
                            studentId: profileQuery.data.student.id,
                            minInitialPayment: feeForm.minInitialPayment,
                            paymentDueDate: feeForm.paymentDueDate ? new Date(feeForm.paymentDueDate) : undefined,
                          });
                        }}>
                          Update Fee Schedule
                        </Button>
                      </Card>
                    )}
                  </div>
                </TabsContent>

                {/* 5. Performance Reports Tab */}
                <TabsContent value="performance" className="space-y-4 outline-none">
                  <div className="space-y-3">
                    {profileQuery.data.feedback.map((f) => (
                      <Card key={f.id} className="border-slate-100 shadow-sm bg-slate-50/20">
                        <CardHeader className="py-2.5 px-4 bg-slate-50 flex flex-row justify-between items-center border-b">
                          <div className="flex items-center gap-2">
                            <Award className="w-4 h-4 text-amber-500" />
                            <span className="text-xs font-bold text-slate-700">Rating: {f.rating}/5</span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono">{new Date(f.createdAt).toLocaleDateString()}</span>
                        </CardHeader>
                        <CardContent className="p-4 text-xs text-slate-600">
                          <p className="italic">"{f.comment}"</p>
                          <p className="text-right text-[10px] text-gray-400 font-semibold mt-2">— Teacher: {f.teacher?.name || "Teacher"}</p>
                        </CardContent>
                      </Card>
                    ))}
                    {profileQuery.data.feedback.length === 0 && (
                      <div className="text-center py-10 text-slate-400 text-xs">
                        No performance feedback reports found.
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* 6. Documents Tab */}
                <TabsContent value="documents" className="space-y-4 outline-none">
                  {isAdmin && (
                    <Card className="border border-dashed border-slate-200 bg-slate-50/50 p-4">
                      <h4 className="font-bold text-xs text-slate-800 mb-3 uppercase tracking-wider">Add Student Document Link</h4>
                      <div className="flex flex-col sm:flex-row items-center gap-3">
                        <Input
                          placeholder="Document Name (e.g. TOEFL Certificate)"
                          className="h-9 text-xs"
                          value={newDoc.name}
                          onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })}
                        />
                        <Input
                          placeholder="Document URL (e.g. https://drive.google.com/xyz)"
                          className="h-9 text-xs"
                          value={newDoc.url}
                          onChange={(e) => setNewDoc({ ...newDoc, url: e.target.value })}
                        />
                        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 h-9 text-xs" onClick={() => {
                          if (!newDoc.name || !newDoc.url) {
                            toast.error("Both document name and URL are required");
                            return;
                          }
                          addDocumentMutation.mutate({
                            studentId: profileQuery.data.student.id,
                            name: newDoc.name,
                            url: newDoc.url,
                          });
                        }}>
                          <FileUp className="w-4 h-4 mr-2" />
                          Add Doc
                        </Button>
                      </div>
                    </Card>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    {((profileQuery.data.student.profile?.documents || []) as any[]).map((doc: any) => (
                      <div key={doc.id} className="flex justify-between items-center p-3 border rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                          <FileText className="w-8 h-8 text-emerald-600 bg-emerald-50 p-1.5 rounded-lg shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-slate-700 truncate max-w-[200px]" title={doc.name}>{doc.name}</p>
                            <p className="text-[10px] text-gray-400 font-mono mt-0.5">{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : ""}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <a href={doc.url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><Eye className="w-4 h-4 text-slate-600" /></Button>
                          </a>
                          {isAdmin && (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-700" onClick={() => {
                              deleteDocumentMutation.mutate({
                                studentId: profileQuery.data.student.id,
                                documentId: doc.id,
                              });
                            }}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {(!profileQuery.data.student.profile?.documents || (profileQuery.data.student.profile.documents as any[]).length === 0) && (
                      <div className="col-span-2 text-center py-10 text-slate-400 text-xs">
                        No uploaded student documents found.
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* 7. Communication History Tab */}
                <TabsContent value="communication" className="space-y-4 outline-none">
                  <div className="border rounded-xl bg-slate-50 p-4 max-h-[350px] overflow-y-auto space-y-3">
                    {profileQuery.data.chatHistory.map((msg) => {
                      const isOutgoing = msg.senderId !== profileQuery.data.student.id;
                      return (
                        <div key={msg.id} className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}>
                          <div className={`p-3 rounded-2xl max-w-[75%] shadow-sm text-xs leading-relaxed ${
                            isOutgoing
                              ? "bg-emerald-600 text-white rounded-tr-none"
                              : "bg-white text-slate-700 border border-slate-100 rounded-tl-none"
                          }`}>
                            <div className="flex justify-between items-center gap-6 mb-1 text-[10px] opacity-75 font-semibold">
                              <span>{isOutgoing ? "Admin/Staff" : msg.sender?.name}</span>
                              <span className="font-mono">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p>{msg.content}</p>
                          </div>
                        </div>
                      );
                    })}
                    {profileQuery.data.chatHistory.length === 0 && (
                      <div className="text-center py-10 text-slate-400 text-xs">
                        No recent private message exchanges found.
                      </div>
                    )}
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
