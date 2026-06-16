import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Download, AlertTriangle } from "lucide-react";

export default function ReportsPage() {
  const { user } = useAuth();
  const [studentId, setStudentId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");

  const statsQuery = trpc.admin.getDashboardStats.useQuery(undefined, { enabled: isAdmin });
  const studentReport = trpc.admin.getStudentReport.useQuery(
    { studentId: isNaN(Number(studentId)) ? studentId : Number(studentId) },
    { enabled: !!studentId && isAdmin }
  );
  const teacherReport = trpc.admin.getTeacherReport.useQuery(
    { teacherId: isNaN(Number(teacherId)) ? teacherId : Number(teacherId) },
    { enabled: !!teacherId && isAdmin }
  );
  const leaderboard = trpc.admin.getLeaderboard.useQuery(undefined, { enabled: isAdmin });
  const myAttendance = trpc.class.myAttendance.useQuery(undefined, { enabled: user?.role === "student" });

  const exportStudentReport = trpc.admin.exportStudentReport.useQuery(
    { studentId: isNaN(Number(studentId)) ? studentId : Number(studentId) },
    { enabled: false }
  );
  const exportTeacherReport = trpc.admin.exportTeacherReport.useQuery(
    { teacherId: isNaN(Number(teacherId)) ? teacherId : Number(teacherId) },
    { enabled: false }
  );

  const handleExportStudent = async () => {
    if (!studentId) return;
    const result = await exportStudentReport.refetch();
    if (result.data) toast.info(JSON.stringify(result.data.data, null, 2).slice(0, 300) + "...");
  };

  const handleExportTeacher = async () => {
    if (!teacherId) return;
    const result = await exportTeacherReport.refetch();
    if (result.data) toast.info(JSON.stringify(result.data.data, null, 2).slice(0, 300) + "...");
  };

  return (
    <div className="space-y-6">
      {isAdmin && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">Total Students</p>
                <p className="text-2xl font-bold">{statsQuery.data?.totalStudents || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">Teachers</p>
                <p className="text-2xl font-bold">{statsQuery.data?.totalTeachers || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">Batches</p>
                <p className="text-2xl font-bold">{statsQuery.data?.totalBatches || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">Pending Fees</p>
                <p className="text-2xl font-bold">₹{statsQuery.data?.pendingFees || 0}</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="student">
            <TabsList>
              <TabsTrigger value="student">Student Report</TabsTrigger>
              <TabsTrigger value="teacher">Teacher Report</TabsTrigger>
              <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            </TabsList>

            <TabsContent value="student">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Student Report Lookup</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3 mb-4">
                    <Input placeholder="Enter Student ID" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
                    <Button variant="outline" onClick={handleExportStudent} disabled={!studentId}>
                      <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                  </div>
                  {studentReport.data && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="bg-gray-50 dark:bg-slate-900 border p-4 rounded-lg">
                          <p className="text-sm text-gray-500">Attendance</p>
                          <p className="text-xl font-bold">{studentReport.data.attendance.percentage}%</p>
                          <p className="text-xs text-gray-500">{studentReport.data.attendance.present}/{studentReport.data.attendance.total} classes</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-slate-900 border p-4 rounded-lg">
                          <p className="text-sm text-gray-500">Course / Batch</p>
                          <p className="text-base font-bold truncate">{studentReport.data.profile?.course || "-"}</p>
                          <p className="text-xs text-gray-500 truncate">Batch: {studentReport.data.profile?.batch || "-"}</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-slate-900 border p-4 rounded-lg">
                          <p className="text-sm text-gray-500">Payment Mode & Status</p>
                          <p className="text-base font-bold capitalize">{studentReport.data.paymentType === "INSTALLMENT" ? "Installment" : "Full Payment"}</p>
                          <Badge className="mt-1 bg-emerald-100 text-emerald-700 capitalize">{studentReport.data.profile?.paymentStatus || "unpaid"}</Badge>
                        </div>
                        <div className="bg-gray-50 dark:bg-slate-900 border p-4 rounded-lg">
                          <p className="text-sm text-gray-500">Outstanding Balance</p>
                          <p className="text-xl font-bold text-red-600">₹{studentReport.data.profile?.feesBalance || 0}</p>
                          <p className="text-xs text-gray-500">Paid: ₹{studentReport.data.profile?.feesPaid || 0} of ₹{studentReport.data.profile?.feesTotal || 0}</p>
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Payment ID</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {studentReport.data.payments.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell>#{p.id}</TableCell>
                              <TableCell>₹{p.amount}</TableCell>
                              <TableCell><Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                              <TableCell>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="teacher">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Teacher Report Lookup</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3 mb-4">
                    <Input placeholder="Enter Teacher ID" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} />
                    <Button variant="outline" onClick={handleExportTeacher} disabled={!teacherId}>
                      <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                  </div>
                  {teacherReport.data && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Total Classes</p>
                        <p className="text-xl font-bold">{teacherReport.data.totalClasses}</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Engagement Rate</p>
                        <p className="text-xl font-bold">{teacherReport.data.studentEngagementRate}</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Retention Rate</p>
                        <p className="text-xl font-bold">{teacherReport.data.studentRetentionRate}%</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Completion Rate</p>
                        <p className="text-xl font-bold">{teacherReport.data.courseCompletionRate}%</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg col-span-2">
                        <p className="text-sm text-gray-500">Performance</p>
                        <Badge className={teacherReport.data.performanceLabel === "Best" ? "bg-emerald-100 text-emerald-700" : teacherReport.data.performanceLabel === "Needs Improvement" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}>
                          {teacherReport.data.performanceLabel}
                        </Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="leaderboard">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Student Leaderboard</CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Attendance %</TableHead>
                        <TableHead>Chat Activity</TableHead>
                        <TableHead>Composite Score</TableHead>
                        <TableHead>At Risk</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaderboard.data?.map((s, i) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-bold text-gray-500">#{i + 1}</TableCell>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>{s.attendancePct}%</TableCell>
                          <TableCell>{s.chatActivity}</TableCell>
                          <TableCell className="font-bold">{s.compositeScore}</TableCell>
                          <TableCell>
                            {(s as any).atRisk && <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" /> At Risk</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {user?.role === "student" && myAttendance.data && (
        <Card>
          <CardHeader>
            <CardTitle>My Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">Classes Attended</p>
                  <p className="text-xl font-bold">{myAttendance.data.filter((a) => a.status === "present").length}</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">Classes Missed</p>
                  <p className="text-xl font-bold">{myAttendance.data.filter((a) => a.status === "absent").length}</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Chat Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myAttendance.data.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.class?.title || "-"}</TableCell>
                      <TableCell>{a.recordedAt ? new Date(a.recordedAt).toLocaleDateString() : "-"}</TableCell>
                      <TableCell>
                        <Badge variant={a.status === "present" ? "default" : "secondary"} className={a.status === "present" ? "bg-emerald-100 text-emerald-700" : ""}>
                          {a.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{a.chatCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
