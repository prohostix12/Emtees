import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Coins, 
  Settings, 
  Printer, 
  AlertTriangle, 
  CheckCircle, 
  History, 
  Download 
} from "lucide-react";

export default function SalariesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin";
  const isTeacher = user?.role === "teacher";

  // State variables for Admin workspace
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // 'YYYY-MM'
  
  // Salary Config Edit Dialog State
  const [editTeacher, setEditTeacher] = useState<any>(null);
  const [basicSalary, setBasicSalary] = useState<number>(0);
  const [groupClassRate, setGroupClassRate] = useState<number>(0);
  const [oneToOneRate, setOneToOneRate] = useState<number>(0);
  const [configDialogOpen, setConfigDialogOpen] = useState<boolean>(false);

  // Mark as Paid Dialog State
  const [paySalaryId, setPaySalaryId] = useState<number | null>(null);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().slice(0, 10)); // 'YYYY-MM-DD'
  const [payDialogOpen, setPayDialogOpen] = useState<boolean>(false);

  // View Statement Modal State
  const [activeStatement, setActiveStatement] = useState<any>(null);
  const [statementDialogOpen, setStatementDialogOpen] = useState<boolean>(false);

  // tRPC Queries & Mutations
  const utils = trpc.useUtils();
  const teachersQuery = trpc.user.list.useQuery({ role: "teacher" }, { enabled: isAdmin });
  const allSalariesQuery = trpc.admin.listSalaries.useQuery(undefined, { enabled: isAdmin });
  const configQuery = trpc.admin.getSalaryConfig.useQuery(
    { teacherId: Number(editTeacher?.id) },
    { enabled: !!editTeacher }
  );
  const auditLogsQuery = trpc.admin.listConfigAuditLogs.useQuery(
    { teacherId: editTeacher ? Number(editTeacher.id) : undefined },
    { enabled: !!editTeacher }
  );

  // Teacher specific queries
  const mySalariesQuery = trpc.user.mySalaries.useQuery(undefined, { enabled: isTeacher });

  // Mutations
  const updateConfigMutation = trpc.admin.updateSalaryConfig.useMutation({
    onSuccess: () => {
      toast.success("Salary configuration updated successfully");
      setConfigDialogOpen(false);
      utils.admin.listConfigAuditLogs.invalidate();
    },
    onError: (err) => {
      toast.error(`Error: ${err.message}`);
    }
  });

  const calculateSalaryMutation = trpc.admin.calculateSalary.useMutation({
    onSuccess: () => {
      toast.success("Salary calculated and recorded successfully");
      utils.admin.listSalaries.invalidate();
    },
    onError: (err) => {
      toast.error(`Error: ${err.message}`);
    }
  });

  const markPaidMutation = trpc.admin.markSalaryPaid.useMutation({
    onSuccess: () => {
      toast.success("Salary marked as paid");
      setPayDialogOpen(false);
      utils.admin.listSalaries.invalidate();
      if (isTeacher) {
        utils.user.mySalaries.invalidate();
      }
    },
    onError: (err) => {
      toast.error(`Error: ${err.message}`);
    }
  });

  // Calculate salary for specific teacher
  const handleCalculate = async () => {
    if (!selectedTeacherId) {
      toast.error("Please select a teacher");
      return;
    }
    if (!selectedMonth) {
      toast.error("Please select a month");
      return;
    }

    calculateSalaryMutation.mutate({
      teacherId: Number(selectedTeacherId),
      month: selectedMonth
    });
  };

  // Open configuration edit dialog
  const handleOpenConfig = (teacher: any) => {
    setEditTeacher(teacher);
    setConfigDialogOpen(true);
  };

  // Set inputs when configuration query returns
  useEffect(() => {
    if (configQuery.data) {
      setBasicSalary(parseFloat(configQuery.data.basicSalary) || 0);
      setGroupClassRate(parseFloat(configQuery.data.groupClassRate) || 0);
      setOneToOneRate(parseFloat(configQuery.data.oneToOneRate) || 0);
    }
  }, [configQuery.data]);

  const handleSaveConfig = () => {
    if (!editTeacher) return;
    updateConfigMutation.mutate({
      teacherId: Number(editTeacher.id),
      basicSalary,
      groupClassRate,
      oneToOneRate
    });
  };

  const handleOpenPayDialog = (salaryId: number) => {
    setPaySalaryId(salaryId);
    setPayDialogOpen(true);
  };

  const handleConfirmPayment = () => {
    if (paySalaryId === null) return;
    markPaidMutation.mutate({
      salaryId: paySalaryId,
      paymentDate: new Date(payDate)
    });
  };

  const handleDownloadStatement = (salary: any) => {
    const data = {
      reportType: "Teacher Salary Statement",
      generatedAt: new Date().toISOString(),
      teacherName: salary.teacher?.name || user?.name || "Teacher",
      month: salary.month,
      breakdown: {
        basicSalary: parseFloat(salary.basicSalary || "0"),
        completedGroupClasses: salary.groupClassesCount,
        groupClassRate: parseFloat(salary.groupClassRate || "0"),
        groupClassEarnings: salary.groupClassesCount * parseFloat(salary.groupClassRate || "0"),
        completedOneToOneSessions: salary.oneToOneCount,
        oneToOneSessionRate: parseFloat(salary.oneToOneRate || "0"),
        oneToOneEarnings: salary.oneToOneCount * parseFloat(salary.oneToOneRate || "0"),
        totalSalary: parseFloat(salary.totalAmount || "0")
      },
      paymentStatus: salary.status,
      paymentDate: salary.paymentDate ? new Date(salary.paymentDate).toLocaleDateString() : null
    };

    const filename = `Salary_Statement_${salary.month}_${data.teacherName.replace(/\s+/g, "_")}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Statement exported successfully as JSON");
  };

  const handleOpenPrintPreview = (salary: any) => {
    setActiveStatement(salary);
    setStatementDialogOpen(true);
  };

  // Render Super Admin View
  if (isAdmin) {
    const selectedTeacherName = teachersQuery.data?.find((t) => String(t.id) === selectedTeacherId)?.name || "";
    
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Teacher Salaries Workspace</h1>
            <p className="text-sm text-gray-500">Configure rates, auto-calculate monthly earnings, and manage payouts.</p>
          </div>
        </div>

        <Tabs defaultValue="history" className="w-full">
          <TabsList className="grid w-full grid-cols-3 md:w-auto md:inline-flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <TabsTrigger value="history" className="rounded-md px-4 py-2 text-sm font-medium transition-all">Payout History</TabsTrigger>
            <TabsTrigger value="calculate" className="rounded-md px-4 py-2 text-sm font-medium transition-all">Run Calculations</TabsTrigger>
            <TabsTrigger value="configs" className="rounded-md px-4 py-2 text-sm font-medium transition-all">Teacher Rates</TabsTrigger>
          </TabsList>

          {/* Payout History Tab */}
          <TabsContent value="history" className="mt-6 space-y-4">
            <Card className="border border-gray-100 shadow-sm bg-white">
              <CardHeader>
                <CardTitle className="text-lg">Salary Payout Logs</CardTitle>
                <CardDescription>Track all automatically calculated salaries and their current settlement status.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 hover:bg-gray-50 border-b">
                      <TableHead>Teacher</TableHead>
                      <TableHead>Month</TableHead>
                      <TableHead>Basic Salary</TableHead>
                      <TableHead className="hidden md:table-cell">Group Classes</TableHead>
                      <TableHead className="hidden md:table-cell">1-to-1 Sessions</TableHead>
                      <TableHead>Total Earnings</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allSalariesQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-gray-400">Loading payout logs...</TableCell>
                      </TableRow>
                    ) : allSalariesQuery.data?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-gray-400">No salary records found. Configure rates and run calculation first.</TableCell>
                      </TableRow>
                    ) : (
                      allSalariesQuery.data?.map((salary: any) => (
                        <TableRow key={salary.id} className="hover:bg-gray-50/50">
                          <TableCell className="font-semibold text-gray-900">{salary.teacher?.name || `Teacher #${salary.teacherId}`}</TableCell>
                          <TableCell className="font-medium text-emerald-700">{salary.month}</TableCell>
                          <TableCell>₹{parseFloat(salary.basicSalary || "0").toLocaleString("en-IN")}</TableCell>
                          <TableCell className="hidden md:table-cell font-medium">
                            {salary.groupClassesCount} <span className="text-xs text-gray-400">× ₹{parseFloat(salary.groupClassRate || "0")}</span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell font-medium">
                            {salary.oneToOneCount} <span className="text-xs text-gray-400">× ₹{parseFloat(salary.oneToOneRate || "0")}</span>
                          </TableCell>
                          <TableCell className="font-bold text-gray-900">₹{parseFloat(salary.totalAmount || "0").toLocaleString("en-IN")}</TableCell>
                          <TableCell>
                            <Badge 
                              className={
                                salary.status === "paid" 
                                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" 
                                  : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                              }
                            >
                              {salary.status === "paid" ? "Settled" : "Pending"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-500 font-medium">
                            {salary.paymentDate ? new Date(salary.paymentDate).toLocaleDateString() : "-"}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {salary.status !== "paid" && (
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleOpenPayDialog(salary.id)}
                              >
                                Mark Paid
                              </Button>
                            )}
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-gray-500 hover:text-gray-700" 
                              onClick={() => handleOpenPrintPreview(salary)}
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-gray-500 hover:text-gray-700" 
                              onClick={() => handleDownloadStatement(salary)}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Salary Calculation Tab */}
          <TabsContent value="calculate" className="mt-6">
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="md:col-span-2 border border-gray-100 shadow-sm bg-white">
                <CardHeader>
                  <CardTitle className="text-lg">Run Monthly Calculations</CardTitle>
                  <CardDescription>Select a teacher and month to auto-calculate completed classes & total earnings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="teacher-select">Select Teacher</Label>
                      <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                        <SelectTrigger id="teacher-select" className="w-full bg-white border border-gray-200">
                          <SelectValue placeholder="Choose a teacher..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white border">
                          {teachersQuery.data?.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="month-select">Calculation Month</Label>
                      <Input 
                        id="month-select" 
                        type="month" 
                        value={selectedMonth} 
                        onChange={(e) => setSelectedMonth(e.target.value)} 
                        className="bg-white border border-gray-200"
                      />
                    </div>
                  </div>

                  <div className="pt-4">
                    <Button 
                      className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-6 py-2.5 transition-all shadow-sm"
                      onClick={handleCalculate}
                      disabled={calculateSalaryMutation.isPending || !selectedTeacherId}
                    >
                      {calculateSalaryMutation.isPending ? "Calculating..." : "Calculate & Record Earnings"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Calculations Helper Info Card */}
              <Card className="border border-emerald-100 bg-emerald-50/20 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base text-emerald-800 flex items-center gap-2">
                    <Coins className="w-5 h-5 text-emerald-600" />
                    Salary Formula
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-gray-600">
                  <p>System automatically queries completed live classes and completed 1-to-1 sessions within the target month.</p>
                  <div className="bg-white p-3 rounded-lg border border-emerald-100 font-mono text-xs text-emerald-900 leading-relaxed shadow-sm">
                    <strong>Total Earnings =</strong> <br />
                    Basic Salary + <br />
                    (Group Classes × Group Class Rate) + <br />
                    (1-to-1 Sessions × 1-to-1 Rate)
                  </div>
                  {selectedTeacherId && (
                    <p className="text-xs text-gray-500 italic mt-4">
                      Calculating for: <span className="font-semibold text-emerald-700">{selectedTeacherName}</span> for <span className="font-semibold text-emerald-700">{selectedMonth}</span>
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Teacher Rates Tab */}
          <TabsContent value="configs" className="mt-6">
            <Card className="border border-gray-100 shadow-sm bg-white">
              <CardHeader>
                <CardTitle className="text-lg">Teacher Salary Configurations</CardTitle>
                <CardDescription>Configure fixed monthly basic salary and variable per-class completion rates.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 border-b">
                      <TableHead>Teacher Name</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Rates & Configurations</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teachersQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-gray-400">Loading teacher configurations...</TableCell>
                      </TableRow>
                    ) : teachersQuery.data?.map((teacher) => (
                      <TableRow key={teacher.id} className="hover:bg-gray-50/50">
                        <TableCell className="font-semibold text-gray-900">{teacher.name}</TableCell>
                        <TableCell className="text-gray-500 font-mono text-xs">{teacher.unionId}</TableCell>
                        <TableCell>
                          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100">{teacher.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="bg-white border-gray-200 hover:bg-gray-50 text-gray-700" 
                            onClick={() => handleOpenConfig(teacher)}
                          >
                            <Settings className="w-4 h-4 mr-2" /> Configure Rates
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialog: Edit Salary Configuration */}
        <Dialog open={configDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setEditTeacher(null);
            setBasicSalary(0);
            setGroupClassRate(0);
            setOneToOneRate(0);
          }
          setConfigDialogOpen(open);
        }}>
          <DialogContent className="max-w-lg bg-white rounded-xl shadow-xl border p-6">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-gray-900">Configure Salary Rates</DialogTitle>
              <DialogDescription>
                Set the default financial configuration for <span className="font-semibold text-emerald-700">{editTeacher?.name}</span>.
              </DialogDescription>
            </DialogHeader>

            {configQuery.isLoading ? (
              <div className="py-8 text-center text-gray-400">Loading current configuration...</div>
            ) : (
              <div className="space-y-4 py-3">
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="basic-salary" className="text-left font-medium text-gray-700">Basic Salary</Label>
                  <div className="col-span-2 relative">
                    <span className="absolute left-3 top-2.5 text-gray-400 text-sm">₹</span>
                    <Input 
                      id="basic-salary" 
                      type="number" 
                      value={basicSalary} 
                      onChange={(e) => setBasicSalary(parseFloat(e.target.value) || 0)} 
                      className="pl-7 bg-white border border-gray-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="group-class-rate" className="text-left font-medium text-gray-700">Group Class Rate</Label>
                  <div className="col-span-2 relative">
                    <span className="absolute left-3 top-2.5 text-gray-400 text-sm">₹</span>
                    <Input 
                      id="group-class-rate" 
                      type="number" 
                      value={groupClassRate} 
                      onChange={(e) => setGroupClassRate(parseFloat(e.target.value) || 0)} 
                      className="pl-7 bg-white border border-gray-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="onetoone-rate" className="text-left font-medium text-gray-700">1-to-1 Session Rate</Label>
                  <div className="col-span-2 relative">
                    <span className="absolute left-3 top-2.5 text-gray-400 text-sm">₹</span>
                    <Input 
                      id="onetoone-rate" 
                      type="number" 
                      value={oneToOneRate} 
                      onChange={(e) => setOneToOneRate(parseFloat(e.target.value) || 0)} 
                      className="pl-7 bg-white border border-gray-200"
                    />
                  </div>
                </div>

                {/* Audit Logs Sub-Section */}
                {auditLogsQuery.data && auditLogsQuery.data.length > 0 && (
                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <History className="w-3.5 h-3.5" />
                      Configuration Audit Log
                    </p>
                    <div className="max-h-36 overflow-y-auto space-y-2 text-xs">
                      {auditLogsQuery.data.map((log: any) => (
                        <div key={log.id} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 text-gray-600 flex items-start justify-between gap-4">
                          <div>
                            <span className="font-semibold text-gray-800 capitalize">{log.fieldName.replace(/([A-Z])/g, " $1")}</span> changed from <span className="font-mono bg-white px-1.5 py-0.5 rounded border">₹{parseFloat(log.previousValue || "0")}</span> to <span className="font-semibold text-emerald-700">₹{parseFloat(log.newValue)}</span>
                          </div>
                          <div className="text-right text-gray-400 shrink-0">
                            <p className="font-medium text-gray-500">{log.changedByUser?.name || "Admin"}</p>
                            <p>{new Date(log.changedAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="pt-4 border-t border-gray-100 gap-2">
              <Button variant="outline" onClick={() => setConfigDialogOpen(false)} className="border-gray-200 hover:bg-gray-50 text-gray-700">Cancel</Button>
              <Button onClick={handleSaveConfig} disabled={updateConfigMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5">Save Configuration</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Mark Salary Paid */}
        <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
          <DialogContent className="max-w-md bg-white rounded-xl shadow-xl p-6 border">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-gray-900">Confirm Settlement Payment</DialogTitle>
              <DialogDescription>Choose the date when this salary payout was disbursed to the teacher.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-2">
                <Label htmlFor="payment-date" className="font-medium text-gray-700">Payment Date</Label>
                <Input 
                  id="payment-date" 
                  type="date" 
                  value={payDate} 
                  onChange={(e) => setPayDate(e.target.value)} 
                  className="bg-white border border-gray-200"
                />
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-gray-100 gap-2">
              <Button variant="outline" onClick={() => setPayDialogOpen(false)} className="border-gray-200 hover:bg-gray-50 text-gray-700">Cancel</Button>
              <Button onClick={handleConfirmPayment} disabled={markPaidMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5">Confirm Settled</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Print Preview Dialog */}
        {activeStatement && (
          <Dialog open={statementDialogOpen} onOpenChange={setStatementDialogOpen}>
            <DialogContent className="max-w-2xl bg-white rounded-xl shadow-xl border p-0 overflow-hidden">
              <div className="p-6 md:p-8 space-y-6" id="printable-statement">
                <div className="flex justify-between items-start border-b border-gray-100 pb-5">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">EMTEES ACADEMY</h2>
                    <p className="text-xs text-gray-500 mt-0.5">LMS & operational dashboard</p>
                  </div>
                  <div className="text-right">
                    <h3 className="text-base font-bold text-emerald-700 uppercase tracking-wide">Salary Statement</h3>
                    <p className="text-sm font-semibold text-gray-700 mt-1">{activeStatement.month}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Teacher Information</p>
                    <p className="font-semibold text-gray-800 text-base">{activeStatement.teacher?.name || user?.name}</p>
                    <p className="text-gray-500 mt-0.5">{activeStatement.teacher?.email || user?.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Statement Details</p>
                    <p className="text-gray-600">ID: <span className="font-mono text-xs bg-gray-50 px-1.5 py-0.5 rounded border">#SL-{activeStatement.id}</span></p>
                    <p className="text-gray-600 mt-1">Status: <span className={`font-semibold ${activeStatement.status === "paid" ? "text-emerald-600" : "text-amber-600"}`}>{activeStatement.status === "paid" ? "Settled" : "Pending"}</span></p>
                  </div>
                </div>

                <div>
                  <Table className="border rounded-lg overflow-hidden">
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead>Earnings Category</TableHead>
                        <TableHead className="text-center">Count / Rate</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium text-gray-800">Basic Salary (Fixed Monthly)</TableCell>
                        <TableCell className="text-center text-gray-500">Fixed</TableCell>
                        <TableCell className="text-right font-medium text-gray-800">₹{parseFloat(activeStatement.basicSalary || "0").toLocaleString("en-IN")}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium text-gray-800">Group Classes</TableCell>
                        <TableCell className="text-center text-gray-500">{activeStatement.groupClassesCount} Completed × ₹{parseFloat(activeStatement.groupClassRate || "0")}</TableCell>
                        <TableCell className="text-right font-medium text-gray-800">
                          ₹{(activeStatement.groupClassesCount * parseFloat(activeStatement.groupClassRate || "0")).toLocaleString("en-IN")}
                        </TableCell>
                      </TableRow>
                      <TableRow className="border-b">
                        <TableCell className="font-medium text-gray-800">One-to-One Sessions</TableCell>
                        <TableCell className="text-center text-gray-500">{activeStatement.oneToOneCount} Sessions × ₹{parseFloat(activeStatement.oneToOneRate || "0")}</TableCell>
                        <TableCell className="text-right font-medium text-gray-800">
                          ₹{(activeStatement.oneToOneCount * parseFloat(activeStatement.oneToOneRate || "0")).toLocaleString("en-IN")}
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-gray-50/50">
                        <TableCell colSpan={2} className="font-bold text-gray-900 text-base">Total Monthly Salary</TableCell>
                        <TableCell className="text-right font-bold text-emerald-700 text-lg">
                          ₹{parseFloat(activeStatement.totalAmount || "0").toLocaleString("en-IN")}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {activeStatement.status === "paid" && (
                  <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100 text-sm text-emerald-800 flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-bold">Payment Settled</p>
                      <p className="text-xs text-emerald-600 mt-0.5">Disbursed on {new Date(activeStatement.paymentDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between gap-2">
                <Button variant="outline" onClick={() => setStatementDialogOpen(false)} className="border-gray-200 text-gray-700">Close</Button>
                <Button onClick={() => window.print()} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5">
                  <Printer className="w-4 h-4 mr-2" /> Print Statement
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  // Render Teacher View
  if (isTeacher) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">My Salary Statements</h1>
          <p className="text-sm text-gray-500">View earnings breakdown and download monthly salary receipts.</p>
        </div>

        <Card className="border border-gray-100 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-lg">Monthly Statements</CardTitle>
            <CardDescription>Review all settlement reports calculated and issued by the Super Admin.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 border-b">
                  <TableHead>Month</TableHead>
                  <TableHead>Basic Salary</TableHead>
                  <TableHead>Group Classes</TableHead>
                  <TableHead>1-to-1 Sessions</TableHead>
                  <TableHead>Total Earnings</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mySalariesQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-400">Loading statements...</TableCell>
                  </TableRow>
                ) : mySalariesQuery.data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-400">No salary statements have been issued yet.</TableCell>
                  </TableRow>
                ) : (
                  mySalariesQuery.data?.map((salary: any) => (
                    <TableRow key={salary.id} className="hover:bg-gray-50/50">
                      <TableCell className="font-semibold text-emerald-700">{salary.month}</TableCell>
                      <TableCell>₹{parseFloat(salary.basicSalary || "0").toLocaleString("en-IN")}</TableCell>
                      <TableCell className="font-medium text-gray-600">
                        {salary.groupClassesCount} <span className="text-xs text-gray-400">× ₹{parseFloat(salary.groupClassRate || "0")}</span>
                      </TableCell>
                      <TableCell className="font-medium text-gray-600">
                        {salary.oneToOneCount} <span className="text-xs text-gray-400">× ₹{parseFloat(salary.oneToOneRate || "0")}</span>
                      </TableCell>
                      <TableCell className="font-bold text-gray-900">₹{parseFloat(salary.totalAmount || "0").toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <Badge 
                          className={
                            salary.status === "paid" 
                              ? "bg-emerald-100 text-emerald-700" 
                              : "bg-amber-100 text-amber-700"
                          }
                        >
                          {salary.status === "paid" ? "Settled" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-500 font-medium">
                        {salary.paymentDate ? new Date(salary.paymentDate).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="border-gray-200 text-gray-700 hover:bg-gray-50"
                          onClick={() => handleOpenPrintPreview(salary)}
                        >
                          <Printer className="w-4 h-4 mr-2" /> View Statement
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="text-gray-500 hover:text-gray-700"
                          onClick={() => handleDownloadStatement(salary)}
                        >
                          <Download className="w-4 h-4" /> Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Print Preview Dialog (Teacher Copy) */}
        {activeStatement && (
          <Dialog open={statementDialogOpen} onOpenChange={setStatementDialogOpen}>
            <DialogContent className="max-w-2xl bg-white rounded-xl shadow-xl border p-0 overflow-hidden">
              <div className="p-6 md:p-8 space-y-6">
                <div className="flex justify-between items-start border-b border-gray-100 pb-5">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">EMTEES ACADEMY</h2>
                    <p className="text-xs text-gray-500 mt-0.5">LMS & operational dashboard</p>
                  </div>
                  <div className="text-right">
                    <h3 className="text-base font-bold text-emerald-700 uppercase tracking-wide">Salary Statement</h3>
                    <p className="text-sm font-semibold text-gray-700 mt-1">{activeStatement.month}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Teacher Information</p>
                    <p className="font-semibold text-gray-800 text-base">{user?.name}</p>
                    <p className="text-gray-500 mt-0.5">{user?.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Statement Details</p>
                    <p className="text-gray-600">ID: <span className="font-mono text-xs bg-gray-50 px-1.5 py-0.5 rounded border">#SL-{activeStatement.id}</span></p>
                    <p className="text-gray-600 mt-1">Status: <span className={`font-semibold ${activeStatement.status === "paid" ? "text-emerald-600" : "text-amber-600"}`}>{activeStatement.status === "paid" ? "Settled" : "Pending"}</span></p>
                  </div>
                </div>

                <div>
                  <Table className="border rounded-lg overflow-hidden">
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead>Earnings Category</TableHead>
                        <TableHead className="text-center">Count / Rate</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium text-gray-800">Basic Salary (Fixed Monthly)</TableCell>
                        <TableCell className="text-center text-gray-500">Fixed</TableCell>
                        <TableCell className="text-right font-medium text-gray-800">₹{parseFloat(activeStatement.basicSalary || "0").toLocaleString("en-IN")}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium text-gray-800">Group Classes</TableCell>
                        <TableCell className="text-center text-gray-500">{activeStatement.groupClassesCount} Completed × ₹{parseFloat(activeStatement.groupClassRate || "0")}</TableCell>
                        <TableCell className="text-right font-medium text-gray-800">
                          ₹{(activeStatement.groupClassesCount * parseFloat(activeStatement.groupClassRate || "0")).toLocaleString("en-IN")}
                        </TableCell>
                      </TableRow>
                      <TableRow className="border-b">
                        <TableCell className="font-medium text-gray-800">One-to-One Sessions</TableCell>
                        <TableCell className="text-center text-gray-500">{activeStatement.oneToOneCount} Sessions × ₹{parseFloat(activeStatement.oneToOneRate || "0")}</TableCell>
                        <TableCell className="text-right font-medium text-gray-800">
                          ₹{(activeStatement.oneToOneCount * parseFloat(activeStatement.oneToOneRate || "0")).toLocaleString("en-IN")}
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-gray-50/50">
                        <TableCell colSpan={2} className="font-bold text-gray-900 text-base">Total Monthly Salary</TableCell>
                        <TableCell className="text-right font-bold text-emerald-700 text-lg">
                          ₹{parseFloat(activeStatement.totalAmount || "0").toLocaleString("en-IN")}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {activeStatement.status === "paid" && (
                  <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100 text-sm text-emerald-800 flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-bold">Payment Settled</p>
                      <p className="text-xs text-emerald-600 mt-0.5">Disbursed on {new Date(activeStatement.paymentDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between gap-2">
                <Button variant="outline" onClick={() => setStatementDialogOpen(false)} className="border-gray-200 text-gray-700">Close</Button>
                <Button onClick={() => window.print()} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5">
                  <Printer className="w-4 h-4 mr-2" /> Print Statement
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  // Fallback for unauthorized roles
  return (
    <Card className="border border-red-100 bg-red-50/20 max-w-md mx-auto mt-8 shadow-sm">
      <CardHeader>
        <CardTitle className="text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          Access Denied
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-gray-600">
        You do not have permission to view salary statements or manage teacher salary configurations.
      </CardContent>
    </Card>
  );
}
