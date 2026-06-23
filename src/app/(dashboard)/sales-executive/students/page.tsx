"use client";

import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, SlidersHorizontal, RefreshCw } from "lucide-react";

export default function MyStudentsPage() {
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const studentsQuery = trpc.salesExecutive.getMyStudents.useQuery({
    search: search || undefined,
    course: courseFilter || undefined,
    status: statusFilter || undefined,
  });

  const students = studentsQuery.data || [];

  // Extract unique courses from students list for filtering
  const uniqueCourses = Array.from(
    new Set(students.map((s) => s.profile?.course).filter(Boolean))
  ) as string[];

  const handleRefresh = () => {
    studentsQuery.refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">My Students</h1>
          <p className="text-xs text-gray-500 mt-1">View and track students registered through your referral link</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={studentsQuery.isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${studentsQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters Card */}
      <Card className="border-gray-100 shadow-sm">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, phone or student ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs rounded-lg border-gray-200"
            />
          </div>

          {/* Course filter */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-gray-400 shrink-0" />
            <Select value={courseFilter} onValueChange={setCourseFilter}>
              <SelectTrigger className="text-xs rounded-lg border-gray-200 bg-white">
                <SelectValue placeholder="All Courses" />
              </SelectTrigger>
              <SelectContent className="text-xs">
                <SelectItem value="all">All Courses</SelectItem>
                {uniqueCourses.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="text-xs rounded-lg border-gray-200 bg-white">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent className="text-xs">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Students List */}
      <Card className="border-gray-100 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow>
                  <TableHead className="text-xs font-semibold">Student ID</TableHead>
                  <TableHead className="text-xs font-semibold">Student Name</TableHead>
                  <TableHead className="text-xs font-semibold">Phone</TableHead>
                  <TableHead className="text-xs font-semibold">Course</TableHead>
                  <TableHead className="text-xs font-semibold">Joined Date</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Fee Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-gray-500 py-10">
                      Loading students list...
                    </TableCell>
                  </TableRow>
                ) : students.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-gray-500 py-10">
                      No students found matching filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  students.map((student) => (
                    <TableRow key={student.id} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell className="text-xs font-mono font-bold text-emerald-700">
                        {student.profile?.enrollmentId || student.unionId}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-gray-900">
                        {student.name}
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">
                        {student.phone || "-"}
                      </TableCell>
                      <TableCell className="text-xs text-gray-700">
                        {student.profile?.course || "-"}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {new Date(student.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          className="capitalize text-[10px]"
                          variant={
                            student.status === "active"
                              ? "default"
                              : student.status === "inactive"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {student.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          className="capitalize text-[10px] bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50"
                          variant="outline"
                        >
                          {student.profile?.paymentStatus || "unpaid"}
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
