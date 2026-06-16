import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Star,
  Filter,
  Download,
  Settings,
  AlertCircle,
  ThumbsUp,
  TrendingUp,
  MessageSquare,
  Sparkles,
  Lock,
  Edit2
} from "lucide-react";

export default function Feedback() {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");
  const isSuperOrAdmin = ["super_admin", "admin"].includes(user?.role || "");
  const isTeacher = user?.role === "teacher";
  const isStudent = user?.role === "student";

  // Shared / State
  const [activeTab, setActiveTab] = useState(isAdmin ? "dashboard" : "feedback");

  if (!user) return null;

  return (
    <div className="space-y-6">
      {isStudent && <StudentFeedbackView />}
      {isTeacher && <TeacherFeedbackView />}
      {isAdmin && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <TabsList className="bg-gray-100 dark:bg-gray-900 rounded-lg p-1">
              <TabsTrigger value="dashboard" className="text-xs font-semibold px-4 py-2">
                <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="records" className="text-xs font-semibold px-4 py-2">
                <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                Feedback List
              </TabsTrigger>
              {isSuperOrAdmin && (
                <TabsTrigger value="settings" className="text-xs font-semibold px-4 py-2">
                  <Settings className="w-3.5 h-3.5 mr-1.5" />
                  Settings
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="space-y-6">
            <AdminFeedbackDashboard />
          </TabsContent>

          <TabsContent value="records" className="space-y-6">
            <AdminFeedbackRecords />
          </TabsContent>

          {isSuperOrAdmin && (
            <TabsContent value="settings" className="space-y-6">
              <FeedbackSettingsTab />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT VIEW
// ─────────────────────────────────────────────────────────────────────────────
function StudentFeedbackView() {
  const conductedTeachersQuery = trpc.student.getConductedTeachers.useQuery();
  const myFeedbackQuery = trpc.student.getMyFeedback.useQuery();
  const settingsQuery = trpc.admin.getFeedbackSettings.useQuery();
  
  const submitFeedbackMutation = trpc.student.submitFeedback.useMutation({
    onSuccess: () => {
      toast.success("Feedback submitted successfully!");
      myFeedbackQuery.refetch();
      setSelectedTeacherBatchKey("");
      setRating(0);
      setComment("");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to submit feedback.");
    },
  });

  const editFeedbackMutation = trpc.student.editFeedback.useMutation({
    onSuccess: () => {
      toast.success("Feedback updated successfully!");
      myFeedbackQuery.refetch();
      setIsEditDialogOpen(false);
      setEditingFeedback(null);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update feedback.");
    },
  });

  // Submission Form State
  const [selectedTeacherBatchKey, setSelectedTeacherBatchKey] = useState<string>("");
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState<string>("");

  // Editing State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingFeedback, setEditingFeedback] = useState<any>(null);
  const [editRating, setEditRating] = useState<number>(0);
  const [editComment, setEditComment] = useState<string>("");

  const handleOpenEdit = (feedbackItem: any) => {
    setEditingFeedback(feedbackItem);
    setEditRating(feedbackItem.rating);
    setEditComment(feedbackItem.comment || "");
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    if (editRating === 0) {
      toast.error("Please select a rating.");
      return;
    }
    editFeedbackMutation.mutate({
      feedbackId: editingFeedback.id,
      rating: editRating,
      comment: editComment,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeacherBatchKey) {
      toast.error("Please select a teacher.");
      return;
    }
    if (rating === 0) {
      toast.error("Please provide a star rating.");
      return;
    }

    const [teacherIdStr, batchIdStr] = selectedTeacherBatchKey.split("-");
    const teacherId = parseInt(teacherIdStr, 10);
    const batchId = parseInt(batchIdStr, 10);

    submitFeedbackMutation.mutate({
      teacherId,
      batchId,
      rating,
      comment,
    });
  };

  const teachers = conductedTeachersQuery.data || [];
  const myFeedbacks = myFeedbackQuery.data || [];
  const editPeriod = settingsQuery.data?.feedback_edit_period_minutes || 60;

  const isEditable = (createdAt: Date) => {
    if (editPeriod <= 0) return false;
    const elapsedMinutes = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60);
    return elapsedMinutes <= editPeriod;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Submit Form */}
      <Card className="lg:col-span-1 border-emerald-100 bg-white shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-emerald-800 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            Teacher Feedback
          </CardTitle>
          <CardDescription>
            Share your learning experience. Your feedback is confidential and helps us improve our academic quality.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="teacher-select">Select Teacher & Batch</Label>
              <Select value={selectedTeacherBatchKey} onValueChange={setSelectedTeacherBatchKey}>
                <SelectTrigger id="teacher-select" className="w-full">
                  <SelectValue placeholder="Choose a teacher..." />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={`${t.teacher.id}-${t.batch.id}`} value={`${t.teacher.id}-${t.batch.id}`}>
                      {t.teacher.name} — {t.batch.name} ({t.batch.module?.name || "Course"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {teachers.length === 0 && !conductedTeachersQuery.isLoading && (
                <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  No completed classes or teachers found yet.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Your Rating (1–5 Stars)</Label>
              <div className="flex items-center gap-1.5 py-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 hover:scale-110 transition-transform focus:outline-none"
                  >
                    <Star
                      className={`w-8 h-8 ${
                        star <= rating
                          ? "text-amber-500 fill-amber-500"
                          : "text-gray-300 hover:text-amber-400"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="comments">Written Feedback (Optional)</Label>
              <Textarea
                id="comments"
                placeholder="What did you like? What can be improved?"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>

            <Button
              type="submit"
              disabled={submitFeedbackMutation.isPending || !selectedTeacherBatchKey || rating === 0}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-10 font-semibold"
            >
              {submitFeedbackMutation.isPending ? "Submitting..." : "Submit Feedback"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* History */}
      <Card className="lg:col-span-2 border-gray-100 bg-white shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="border-b border-gray-50">
          <CardTitle>My Submissions</CardTitle>
          <CardDescription>
            Feedback you have submitted. You can edit your ratings within the configurable period ({editPeriod} minutes).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {myFeedbacks.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <MessageSquare className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              <p className="text-sm">You haven't submitted any feedback yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-transparent">
                    <TableHead className="w-[180px]">Teacher</TableHead>
                    <TableHead className="w-[160px]">Batch / Course</TableHead>
                    <TableHead className="w-[100px]">Rating</TableHead>
                    <TableHead>Comment</TableHead>
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead className="w-[80px] text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myFeedbacks.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.teacher?.name}</TableCell>
                      <TableCell>
                        <div className="text-xs font-semibold text-gray-700">{item.batch?.name}</div>
                        <div className="text-[10px] text-gray-400 truncate max-w-[140px]">{item.batch?.module?.name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          <span className="font-semibold text-sm">{item.rating}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-gray-600 max-w-[200px] truncate" title={item.comment || undefined}>
                        {item.comment || <span className="text-gray-400 italic">No comment</span>}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {new Date(item.createdAt).toLocaleDateString([], { dateStyle: "short" })}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditable(item.createdAt) ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(item)}
                            className="h-8 w-8 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">Locked</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Edit Feedback</DialogTitle>
          </DialogHeader>
          {editingFeedback && (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Teacher</p>
                <p className="text-sm font-semibold">{editingFeedback.teacher?.name}</p>
              </div>

              <div className="space-y-2">
                <Label>Rating</Label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setEditRating(star)}
                      className="p-1 hover:scale-110 transition-transform focus:outline-none"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          star <= editRating
                            ? "text-amber-500 fill-amber-500"
                            : "text-gray-300 hover:text-amber-400"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-comment">Comment</Label>
                <Textarea
                  id="edit-comment"
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={editFeedbackMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={editFeedbackMutation.isPending || editRating === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {editFeedbackMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER VIEW (Aggregated Stats Only)
// ─────────────────────────────────────────────────────────────────────────────
function TeacherFeedbackView() {
  const statsQuery = trpc.admin.getTeacherAggregatedStats.useQuery();
  const stats = statsQuery.data;

  if (statsQuery.error) {
    return (
      <Card className="max-w-md mx-auto border-red-100 bg-red-50/20 dark:bg-red-950/10 p-6 rounded-xl text-center">
        <Lock className="w-10 h-10 text-red-600 mx-auto mb-3" />
        <h4 className="font-semibold text-sm text-red-800 dark:text-red-300">Access Restricted</h4>
        <p className="text-xs text-red-700 dark:text-red-400 mt-1">
          {statsQuery.error.message || "Feedback statistics view is disabled by the administrator."}
        </p>
      </Card>
    );
  }

  if (statsQuery.isLoading) {
    return <p className="text-xs text-gray-500 text-center py-12">Loading statistics...</p>;
  }

  const distribution = stats?.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const totalCount = stats?.totalCount || 0;
  const avg = stats?.averageRating || 0;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h2 className="text-lg font-bold text-emerald-800">My Feedback Statistics</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Scorecard */}
        <Card className="sm:col-span-1 border-emerald-100 shadow-sm bg-gradient-to-br from-emerald-50/20 to-white flex flex-col justify-center items-center p-6 text-center rounded-xl">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Average Rating</p>
          <h1 className="text-5xl font-black text-emerald-800 mt-1">{avg}</h1>
          <div className="flex items-center gap-0.5 mt-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-4 h-4 ${
                  star <= Math.round(avg) ? "text-amber-500 fill-amber-500" : "text-gray-200"
                }`}
              />
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-3">Based on {totalCount} submissions</p>
        </Card>

        {/* Chart */}
        <Card className="sm:col-span-2 border-gray-100 shadow-sm p-6 rounded-xl">
          <p className="text-xs font-semibold text-gray-700 mb-4">Rating Distribution</p>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = distribution[rating as 1|2|3|4|5] || 0;
              const pct = totalCount > 0 ? (count / totalCount) * 100 : 0;
              return (
                <div key={rating} className="flex items-center gap-3 text-xs">
                  <span className="w-3 font-medium text-gray-500">{rating}★</span>
                  <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-semibold text-gray-700">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      
      <div className="flex gap-2.5 p-4 rounded-xl bg-emerald-50/20 border border-emerald-100/40 text-emerald-800 text-[11px] leading-relaxed">
        <ThumbsUp className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <p>
          <strong>Confidentiality Notice:</strong> To protect student privacy, individual student comments and identities are hidden. You are only allowed to see overall counts and aggregated averages.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function AdminFeedbackDashboard() {
  const [teacherId, setTeacherId] = useState<string>("all");
  const [batchId, setBatchId] = useState<string>("all");
  const [courseName, setCourseName] = useState<string>("");

  const teachersQuery = trpc.user.list.useQuery({ role: "teacher", limit: 200 });
  const batchesQuery = trpc.learning.listBatches.useQuery();

  const queryParams = {
    teacherId: teacherId !== "all" ? parseInt(teacherId, 10) : undefined,
    batchId: batchId !== "all" ? parseInt(batchId, 10) : undefined,
    courseName: courseName ? courseName : undefined,
  };

  const statsQuery = trpc.admin.getFeedbackStats.useQuery(queryParams);
  const stats = statsQuery.data;

  const handleClear = () => {
    setTeacherId("all");
    setBatchId("all");
    setCourseName("");
  };

  const total = stats?.totalCount || 0;
  const avg = stats?.averageRating || 0;
  const distribution = stats?.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const recentComments = stats?.recentComments || [];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="border border-gray-100 shadow-sm rounded-xl">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 font-semibold">Teacher</Label>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Teachers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teachers</SelectItem>
                {teachersQuery.data?.map((t) => (
                  <SelectItem key={t.id} value={t.id.toString()}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 font-semibold">Batch</Label>
            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Batches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Batches</SelectItem>
                {batchesQuery.data?.map((b) => (
                  <SelectItem key={b.id} value={b.id.toString()}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 font-semibold">Course / Module</Label>
            <Input
              placeholder="Filter course name..."
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClear}
              className="h-9 text-xs flex-1"
            >
              Clear
            </Button>
            <Button
              onClick={() => statsQuery.refetch()}
              className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
            >
              <Filter className="w-3.5 h-3.5 mr-1" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Scorecard */}
        <Card className="border-emerald-100 shadow-sm bg-gradient-to-br from-emerald-50/10 to-white flex flex-col justify-center items-center p-6 text-center rounded-xl md:col-span-1">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Overall Rating</p>
          <h1 className="text-6xl font-black text-emerald-800 mt-1">{avg}</h1>
          <div className="flex items-center gap-0.5 mt-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-4 h-4 ${
                  star <= Math.round(avg) ? "text-amber-500 fill-amber-500" : "text-gray-200"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3 font-semibold">Total Submissions: {total}</p>
        </Card>

        {/* Rating distribution bar chart */}
        <Card className="border-gray-100 shadow-sm p-6 rounded-xl md:col-span-2">
          <p className="text-sm font-bold text-gray-800 mb-4">Rating Distribution</p>
          <div className="space-y-2.5">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = distribution[rating as 1|2|3|4|5] || 0;
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={rating} className="flex items-center gap-3 text-xs">
                  <span className="w-3 font-bold text-gray-500">{rating}★</span>
                  <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-bold text-gray-700">{count} ({Math.round(pct)}%)</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Recent comments feed */}
      <Card className="border border-gray-100 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="bg-gray-50/40 border-b border-gray-50">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            Recent Written Comments
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-gray-100 p-0">
          {recentComments.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-10">No recent written comments matching the filters.</p>
          ) : (
            recentComments.map((c, idx) => (
              <div key={idx} className="p-4 hover:bg-gray-50/20 transition-colors">
                <div className="flex justify-between items-start mb-1.5 flex-wrap gap-2">
                  <div>
                    <span className="font-bold text-xs text-gray-800">{c.studentName}</span>
                    <span className="text-[10px] text-gray-400 mx-2">submitted for</span>
                    <span className="font-bold text-xs text-emerald-700">{c.teacherName}</span>
                    <span className="text-[10px] text-gray-400 mx-1">({c.batchName})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center">
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 mr-0.5" />
                      <span className="text-xs font-semibold">{c.rating}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-600 italic leading-relaxed">"{c.comment}"</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN RECORDS LIST / TABLE VIEW
// ─────────────────────────────────────────────────────────────────────────────
function AdminFeedbackRecords() {
  const [teacherId, setTeacherId] = useState<string>("all");
  const [batchId, setBatchId] = useState<string>("all");
  const [courseName, setCourseName] = useState<string>("");

  const teachersQuery = trpc.user.list.useQuery({ role: "teacher", limit: 200 });
  const batchesQuery = trpc.learning.listBatches.useQuery();

  const queryParams = {
    teacherId: teacherId !== "all" ? parseInt(teacherId, 10) : undefined,
    batchId: batchId !== "all" ? parseInt(batchId, 10) : undefined,
    courseName: courseName ? courseName : undefined,
  };

  const listQuery = trpc.admin.listFeedback.useQuery(queryParams);
  const feedbacks = listQuery.data || [];

  const handleClear = () => {
    setTeacherId("all");
    setBatchId("all");
    setCourseName("");
  };

  const handleExportCSV = () => {
    if (feedbacks.length === 0) {
      toast.error("No feedback records available to export.");
      return;
    }

    const headers = ["Student Name", "Student ID", "Teacher Name", "Batch Name", "Course Name", "Rating", "Comment", "Submission Date"];
    const rows = feedbacks.map((f) => [
      f.student?.name || "",
      f.student?.unionId || "",
      f.teacher?.name || "",
      f.batch?.name || "",
      f.batch?.module?.name || "",
      f.rating.toString(),
      (f.comment || "").replace(/"/g, '""').replace(/\n/g, ' '),
      new Date(f.createdAt).toLocaleString(),
    ]);

    const csvContent = [
      headers.map(h => `"${h}"`).join(","),
      ...rows.map(r => r.map(v => `"${v}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `lms_student_feedback_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV report exported successfully!");
  };

  return (
    <div className="space-y-6">
      {/* Filter controls */}
      <Card className="border border-gray-100 shadow-sm rounded-xl">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 font-semibold">Teacher</Label>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Teachers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teachers</SelectItem>
                {teachersQuery.data?.map((t) => (
                  <SelectItem key={t.id} value={t.id.toString()}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 font-semibold">Batch</Label>
            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Batches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Batches</SelectItem>
                {batchesQuery.data?.map((b) => (
                  <SelectItem key={b.id} value={b.id.toString()}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 font-semibold">Course / Module</Label>
            <Input
              placeholder="Filter course name..."
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClear}
              className="h-9 text-xs flex-1"
            >
              Clear
            </Button>
            <Button
              onClick={() => listQuery.refetch()}
              className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
            >
              <Filter className="w-3.5 h-3.5 mr-1" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Export Action & Records Table */}
      <Card className="border border-gray-100 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="bg-gray-50/30 border-b border-gray-50 flex flex-row justify-between items-center py-4 px-6 gap-4 flex-wrap">
          <div>
            <CardTitle className="text-sm font-bold">Feedback Listing</CardTitle>
            <CardDescription className="text-xs">
              List of all feedback matching current filter criteria.
            </CardDescription>
          </div>
          <Button
            onClick={handleExportCSV}
            disabled={feedbacks.length === 0}
            className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs h-8 px-3 rounded-lg border border-emerald-100 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <p className="text-xs text-gray-400 text-center py-10">Loading records...</p>
          ) : feedbacks.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-10">No feedback entries found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/40 hover:bg-transparent">
                    <TableHead className="text-xs">Student</TableHead>
                    <TableHead className="text-xs">Teacher</TableHead>
                    <TableHead className="text-xs">Batch / Course</TableHead>
                    <TableHead className="text-xs text-center">Rating</TableHead>
                    <TableHead className="text-xs">Comment</TableHead>
                    <TableHead className="text-xs">Submission Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feedbacks.map((f) => (
                    <TableRow key={f.id} className="hover:bg-gray-50/20">
                      <TableCell className="py-3">
                        <div className="font-semibold text-xs text-gray-800">{f.student?.name}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{f.student?.unionId}</div>
                      </TableCell>
                      <TableCell className="py-3 font-semibold text-xs text-gray-700">{f.teacher?.name}</TableCell>
                      <TableCell className="py-3">
                        <div className="text-xs font-semibold text-gray-700">{f.batch?.name || "N/A"}</div>
                        <div className="text-[10px] text-gray-400 truncate max-w-[150px]">{f.batch?.module?.name}</div>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <div className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-100 font-bold text-xs">
                          {f.rating}★
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-gray-600 max-w-[250px] truncate" title={f.comment || undefined}>
                        {f.comment || <span className="text-gray-300 italic">No comment</span>}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-gray-500">
                        {new Date(f.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION / SETTINGS TAB
// ─────────────────────────────────────────────────────────────────────────────
function FeedbackSettingsTab() {
  const query = trpc.admin.getFeedbackSettings.useQuery();
  
  const mutation = trpc.admin.updateFeedbackSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings saved successfully!");
      query.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update settings.");
    },
  });

  const [editPeriod, setEditPeriod] = useState<number>(60);
  const [oneEntryLimit, setOneEntryLimit] = useState<boolean>(true);
  const [teacherStats, setTeacherStats] = useState<boolean>(false);

  // Initialize values when query loads
  const [initialized, setInitialized] = useState(false);
  if (query.data && !initialized) {
    setEditPeriod(query.data.feedback_edit_period_minutes);
    setOneEntryLimit(query.data.feedback_limit_per_batch);
    setTeacherStats(query.data.feedback_teacher_stats_enabled);
    setInitialized(true);
  }

  const handleSave = () => {
    mutation.mutate({
      feedback_edit_period_minutes: editPeriod,
      feedback_limit_per_batch: oneEntryLimit,
      feedback_teacher_stats_enabled: teacherStats,
    });
  };

  if (query.isLoading) {
    return <p className="text-xs text-gray-500 text-center py-10">Loading settings...</p>;
  }

  return (
    <Card className="max-w-md border border-gray-100 shadow-sm rounded-xl">
      <CardHeader>
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Settings className="w-4 h-4 text-emerald-600" />
          Feedback Rule Configurations
        </CardTitle>
        <CardDescription className="text-xs">
          Set constraints and visibility permissions for the student feedback system.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2.5">
          <Label htmlFor="edit-period-input">Feedback Edit Window (Minutes)</Label>
          <div className="flex items-center gap-3">
            <Input
              id="edit-period-input"
              type="number"
              min={0}
              value={editPeriod}
              onChange={(e) => setEditPeriod(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-24 h-9"
            />
            <span className="text-xs text-gray-500">
              Minutes allowed for students to edit their ratings. Enter 0 to disable editing.
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-xl border border-gray-100 bg-gray-50/40">
          <div className="space-y-0.5">
            <Label className="text-xs font-semibold text-gray-800">One Entry per Batch Limit</Label>
            <p className="text-[10px] text-gray-500 leading-relaxed max-w-[260px]">
              Enforce that students can submit exactly one feedback entry per teacher per course/batch.
            </p>
          </div>
          <Switch
            checked={oneEntryLimit}
            onCheckedChange={setOneEntryLimit}
          />
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-xl border border-gray-100 bg-gray-50/40">
          <div className="space-y-0.5">
            <Label className="text-xs font-semibold text-gray-800">Enable Stats for Teachers</Label>
            <p className="text-[10px] text-gray-500 leading-relaxed max-w-[260px]">
              Allow teachers to view their own aggregated average scores and rating distributions.
            </p>
          </div>
          <Switch
            checked={teacherStats}
            onCheckedChange={setTeacherStats}
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-9 font-semibold text-xs"
        >
          {mutation.isPending ? "Saving..." : "Save Config Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
