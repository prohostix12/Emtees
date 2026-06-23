"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { exportToCSV, exportToExcel, exportToPDF } from "@/lib/exportUtils";
import { BarChart3, Download, RefreshCw, Filter, FileSpreadsheet, FileText } from "lucide-react";

export default function SalesReportsPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role === "sales_executive") {
      router.replace("/?reason=You+do+not+have+permission+to+access+the+reports+page.");
    }
  }, [user, router]);
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "all">("all");

  // Queries
  const performanceQuery = trpc.salesExecutive.getPerformanceDashboard.useQuery({
    period,
  });

  const registrationsQuery = trpc.salesExecutive.getAllRegistrations.useQuery();

  const handleRefresh = () => {
    performanceQuery.refetch();
    registrationsQuery.refetch();
  };

  const performanceData = performanceQuery.data || [];
  const registrationsData = registrationsQuery.data || [];

  // Export 1: Sales Executive Performance Report
  const handleExportPerformance = (format: "csv" | "excel" | "pdf") => {
    if (performanceData.length === 0) {
      toast.warning("No performance data available to export");
      return;
    }

    const title = `Sales Executive Performance Report (${period.toUpperCase()})`;
    const headers = [
      "Employee ID",
      "Name",
      "Registrations",
      "Enrollments",
      "Revenue Generated",
      "Active Students"
    ];

    const rows = performanceData.map((e) => [
      e.employeeId,
      e.name,
      e.totalRegistrations,
      e.totalEnrollments,
      `₹${e.revenueGenerated}`,
      e.activeStudents
    ]);

    if (format === "csv") {
      exportToCSV("sales_performance_report", headers, rows);
    } else if (format === "excel") {
      exportToExcel("sales_performance_report", headers, rows);
    } else {
      exportToPDF(title, headers, rows);
    }
    toast.success(`Exported performance report as ${format.toUpperCase()}`);
  };



  // Export 3: Student Registration Report
  const handleExportRegistrations = (format: "csv" | "excel" | "pdf") => {
    if (registrationsData.length === 0) {
      toast.warning("No registration data available to export");
      return;
    }

    const title = "Student Referral Registration Report";
    const headers = [
      "Student ID",
      "Student Name",
      "Course",
      "Registration Date",
      "Referral Code Used",
      "Sales Executive",
      "Payment Status"
    ];

    const rows = registrationsData.map((r) => [
      r.profile?.enrollmentId || r.unionId,
      r.name,
      r.profile?.course || "-",
      new Date(r.createdAt).toLocaleDateString(),
      r.referralCode || "-",
      r.assignedSalesExecutive?.name || "Unknown",
      r.profile?.paymentStatus || "unpaid"
    ]);

    if (format === "csv") {
      exportToCSV("referred_students_report", headers, rows);
    } else if (format === "excel") {
      exportToExcel("referred_students_report", headers, rows);
    } else {
      exportToPDF(title, headers, rows);
    }
    toast.success(`Exported registrations report as ${format.toUpperCase()}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Sales Reports & Analytics</h1>
          <p className="text-xs text-gray-500 mt-1">Track Conversion rates, Revenue generated and download spreadsheets</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={performanceQuery.isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${performanceQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Export Report Actions Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Performance */}
        <Card className="border-gray-100 shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              Sales Performance Report
            </CardTitle>
            <CardDescription className="text-[11px]">
              Export performance summary including registrations, active students, and revenue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-2 border-t">
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" variant="outline" onClick={() => handleExportPerformance("csv")} className="text-xs">
                CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleExportPerformance("excel")} className="text-xs">
                Excel
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => handleExportPerformance("pdf")}>
                PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Registrations */}
        <Card className="border-gray-100 shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-600" />
              Registration Report
            </CardTitle>
            <CardDescription className="text-[11px]">
              Export list of all referred students including registration dates, courses, and fee statuses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-2 border-t">
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" variant="outline" onClick={() => handleExportRegistrations("csv")} className="text-xs">
                CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleExportRegistrations("excel")} className="text-xs">
                Excel
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => handleExportRegistrations("pdf")}>
                PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Dashboard Table */}
      <Card className="border-gray-100 shadow-sm overflow-hidden">
        <CardHeader className="pb-2 flex flex-row justify-between items-center bg-gray-50/30 border-b">
          <div>
            <CardTitle className="text-base font-semibold">Representative Summary</CardTitle>
            <CardDescription className="text-xs">Individual conversion performance and revenue totals</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <Select value={period} onValueChange={(val: any) => setPeriod(val)}>
              <SelectTrigger className="text-xs bg-white h-8 border-gray-200 rounded-lg min-w-32">
                <SelectValue placeholder="All Time" />
              </SelectTrigger>
              <SelectContent className="text-xs">
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="daily">Daily Report</SelectItem>
                <SelectItem value="weekly">Weekly Report</SelectItem>
                <SelectItem value="monthly">Monthly Report</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow>
                  <TableHead className="text-xs font-semibold">Rep ID</TableHead>
                  <TableHead className="text-xs font-semibold">Name</TableHead>
                  <TableHead className="text-xs font-semibold">Registrations</TableHead>
                  <TableHead className="text-xs font-semibold">Enrollments</TableHead>
                  <TableHead className="text-xs font-semibold">Active Students</TableHead>
                  <TableHead className="text-xs font-semibold">Revenue Generated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performanceQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-xs text-gray-500 py-10">
                      Loading performance summary...
                    </TableCell>
                  </TableRow>
                ) : performanceData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-xs text-gray-500 py-10">
                      No Sales Executives found.
                    </TableCell>
                  </TableRow>
                ) : (
                  performanceData.map((row) => (
                    <TableRow key={row.id} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell className="text-xs font-semibold font-mono text-emerald-800">{row.employeeId}</TableCell>
                      <TableCell className="text-xs font-semibold text-gray-900">{row.name}</TableCell>
                      <TableCell className="text-xs text-gray-600">{row.totalRegistrations}</TableCell>
                      <TableCell className="text-xs text-gray-600">{row.totalEnrollments}</TableCell>
                      <TableCell className="text-xs text-gray-600">{row.activeStudents}</TableCell>
                      <TableCell className="text-xs font-extrabold text-emerald-800">
                        ₹{row.revenueGenerated.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
