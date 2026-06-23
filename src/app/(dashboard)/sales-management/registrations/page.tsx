"use client";

import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, Filter } from "lucide-react";

export default function RegistrationsAdminPage() {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "admin"].includes(user?.role || "");

  const [search, setSearch] = useState("");
  const [execFilter, setExecFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");

  const registrationsQuery = trpc.salesExecutive.getAllRegistrations.useQuery();
  const execsQuery = trpc.salesExecutive.listExecutives.useQuery(undefined, { enabled: isAdmin });

  const handleRefresh = () => {
    registrationsQuery.refetch();
  };

  const rawRegistrations = registrationsQuery.data || [];
  
  // Extract unique courses from students
  const uniqueCourses = Array.from(
    new Set(rawRegistrations.map((r) => r.profile?.course).filter(Boolean))
  ) as string[];

  const filteredRegistrations = rawRegistrations.filter((reg) => {
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      const matchName = reg.name.toLowerCase().includes(searchLower);
      const matchId = (reg.profile?.enrollmentId || reg.unionId)?.toLowerCase().includes(searchLower) || false;
      const matchPhone = reg.phone?.toLowerCase().includes(searchLower) || false;
      if (!matchName && !matchId && !matchPhone) return false;
    }

    // Exec filter
    if (isAdmin && execFilter !== "all" && reg.salesExecutiveId?.toString() !== execFilter) {
      return false;
    }

    // Course filter
    if (courseFilter !== "all" && reg.profile?.course !== courseFilter) {
      return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Referral Registrations</h1>
          <p className="text-xs text-gray-500 mt-1">Monitor all student registrations created through sales referral links</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={registrationsQuery.isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${registrationsQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters Card */}
      <Card className="border-gray-100 shadow-sm">
        <CardContent className={`p-4 grid grid-cols-1 ${isAdmin ? "md:grid-cols-3" : "md:grid-cols-2"} gap-3`}>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by student name, ID, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs rounded-lg border-gray-200"
            />
          </div>

          {/* Course filter */}
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="text-xs rounded-lg border-gray-200 bg-white">
              <SelectValue placeholder="All Courses" />
            </SelectTrigger>
            <SelectContent className="text-xs">
              <SelectItem value="all">All Courses</SelectItem>
              {uniqueCourses.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Exec filter */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400 shrink-0" />
              <Select value={execFilter} onValueChange={setExecFilter}>
                <SelectTrigger className="text-xs rounded-lg border-gray-200 bg-white">
                  <SelectValue placeholder="All Sales Representatives" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="all">All Sales Representatives</SelectItem>
                  {execsQuery.data?.map((exec) => (
                    <SelectItem key={exec.id} value={exec.id.toString()}>
                      {exec.name} ({exec.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Registrations List */}
      <Card className="border-gray-100 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow>
                  <TableHead className="text-xs font-semibold">Student ID</TableHead>
                  <TableHead className="text-xs font-semibold">Student Name</TableHead>
                  <TableHead className="text-xs font-semibold">Course Module</TableHead>
                  <TableHead className="text-xs font-semibold">Registration Date</TableHead>
                  <TableHead className="text-xs font-semibold">Referral Code Used</TableHead>
                  {isAdmin && <TableHead className="text-xs font-semibold">Assigned Sales Executive</TableHead>}
                  <TableHead className="text-xs font-semibold">Payment Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrationsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-xs text-gray-500 py-10">
                      Loading referral registrations...
                    </TableCell>
                  </TableRow>
                ) : filteredRegistrations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-xs text-gray-500 py-10">
                      No referred student registrations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRegistrations.map((reg) => (
                    <TableRow key={reg.id} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell className="text-xs font-semibold font-mono text-emerald-800">{reg.profile?.enrollmentId || reg.unionId}</TableCell>
                      <TableCell className="text-xs font-semibold text-gray-900">{reg.name}</TableCell>
                      <TableCell className="text-xs text-gray-700">{reg.profile?.course || "-"}</TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {new Date(reg.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-medium">{reg.referralCode || "-"}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-xs font-medium text-emerald-900">
                          {reg.assignedSalesExecutive?.name || "Unknown"} ({reg.assignedSalesExecutive?.employeeId || "-"})
                        </TableCell>
                      )}
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50 text-[10px] capitalize">
                          {reg.profile?.paymentStatus || "unpaid"}
                        </Badge>
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
