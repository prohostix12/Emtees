import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Megaphone,
  Video,
  MessageSquare,
  CreditCard,
  X,
  Plus,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";

export default function NotificationsPage() {
  const { user } = useAuth();
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [limit, setLimit] = useState(20);
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");

  // Broadcast form state
  const [form, setForm] = useState({
    title: "",
    description: "",
    audienceType: "all" as "all" | "students" | "teachers" | "batch" | "course",
    audienceId: undefined as number | undefined,
    expiresAt: "",
  });

  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");

  // TRPC Queries
  const { data, isLoading, refetch } = trpc.notification.list.useQuery(
    { limit },
    { enabled: !!user }
  );

  // Fetch batches & modules for broadcast targeted dropdowns
  const { data: batchesList } = trpc.learning.listBatches.useQuery(undefined, {
    enabled: isAdmin && broadcastOpen,
  });

  const { data: modulesList } = trpc.learning.listModules.useQuery(undefined, {
    enabled: isAdmin && broadcastOpen,
  });

  // TRPC Mutations
  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Notification marked as read");
    },
    onError: (err) => toast.error(err.message),
  });

  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("All notifications marked as read");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteNotification = trpc.notification.delete.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Notification deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const dismissAnnouncement = trpc.notification.dismissAnnouncement.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Announcement dismissed");
    },
    onError: (err) => toast.error(err.message),
  });

  const createAnnouncement = trpc.notification.createAnnouncement.useMutation({
    onSuccess: () => {
      toast.success("Announcement published successfully");
      setBroadcastOpen(false);
      setForm({
        title: "",
        description: "",
        audienceType: "all",
        audienceId: undefined,
        expiresAt: "",
      });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreateBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      toast.error("Please fill in both title and description.");
      return;
    }

    createAnnouncement.mutate({
      title: form.title,
      description: form.description,
      audienceType: form.audienceType,
      audienceId: form.audienceId,
      expiresAt: form.expiresAt ? form.expiresAt : undefined,
    });
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "announcement":
        return <Megaphone className="w-4 h-4 text-amber-600" />;
      case "class_reminder":
        return <Video className="w-4 h-4 text-emerald-600" />;
      case "private_message":
        return <MessageSquare className="w-4 h-4 text-sky-600" />;
      case "payment":
        return <CreditCard className="w-4 h-4 text-rose-600" />;
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  const getIconBgColor = (type: string, isRead: boolean) => {
    if (isRead) return "bg-gray-100";
    switch (type) {
      case "announcement":
        return "bg-amber-50 dark:bg-amber-950/40";
      case "class_reminder":
        return "bg-emerald-50 dark:bg-emerald-950/40";
      case "private_message":
        return "bg-sky-50 dark:bg-sky-950/40";
      case "payment":
        return "bg-rose-50 dark:bg-rose-950/40";
      default:
        return "bg-slate-50 dark:bg-slate-950/40";
    }
  };

  // Filter items based on tab
  const items = data?.items || [];
  const filteredItems = activeTab === "all" ? items : items.filter((item) => !item.isRead);
  const unreadCount = items.filter((n) => !n.isRead).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold tracking-tight">Notifications</h3>
            {unreadCount > 0 && (
              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-2 py-0.5 rounded-full">
                {unreadCount} unread
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Keep track of class schedules, private messages, announcements, and tasks.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="text-xs text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            >
              <CheckCheck className="w-3.5 h-3.5 mr-1" />
              Mark all read
            </Button>
          )}

          {isAdmin && (
            <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-3 rounded-lg shadow-sm">
                  <Plus className="w-4 h-4 mr-1.5" />
                  New Broadcast
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-white dark:bg-slate-950 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800">
                <DialogHeader>
                  <DialogTitle className="text-lg font-bold text-gray-800 dark:text-gray-100">
                    Publish Admin Broadcast
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateBroadcast} className="space-y-4 mt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Broadcast Title <span className="text-red-500">*</span>
                    </label>
                    <Input
                      placeholder="e.g. Schedule Update or Maintenance notice"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Announcement Details <span className="text-red-500">*</span>
                    </label>
                    <Textarea
                      placeholder="Describe the notice in detail for targeted users..."
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="min-h-24"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Target Audience
                      </label>
                      <Select
                        value={form.audienceType}
                        onValueChange={(val: any) =>
                          setForm({ ...form, audienceType: val, audienceId: undefined })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select target" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Users</SelectItem>
                          <SelectItem value="students">Students Only</SelectItem>
                          <SelectItem value="teachers">Teachers Only</SelectItem>
                          <SelectItem value="batch">Specific Batch</SelectItem>
                          <SelectItem value="course">Specific Course</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Expiry Date <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <Input
                        type="datetime-local"
                        value={form.expiresAt}
                        onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                      />
                    </div>
                  </div>

                  {form.audienceType === "batch" && (
                    <div className="space-y-1.5 animate-in fade-in duration-200">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Target Batch
                      </label>
                      <Select
                        value={form.audienceId?.toString() || ""}
                        onValueChange={(val) => setForm({ ...form, audienceId: Number(val) })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a Batch" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {batchesList?.map((b) => (
                            <SelectItem key={b.id} value={b.id.toString()}>
                              {b.name} ({b.module?.name})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {form.audienceType === "course" && (
                    <div className="space-y-1.5 animate-in fade-in duration-200">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Target Course
                      </label>
                      <Select
                        value={form.audienceId?.toString() || ""}
                        onValueChange={(val) => setForm({ ...form, audienceId: Number(val) })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a Course" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {modulesList?.map((m) => (
                            <SelectItem key={m.id} value={m.id.toString()}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-1/2"
                      onClick={() => setBroadcastOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={createAnnouncement.isPending}
                    >
                      {createAnnouncement.isPending ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Publishing...
                        </>
                      ) : (
                        "Publish Broadcast"
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        defaultValue="all"
        value={activeTab}
        onValueChange={(val: any) => setActiveTab(val)}
        className="w-full"
      >
        <TabsList className="bg-gray-100 dark:bg-slate-900 border border-gray-200/50 p-1 rounded-lg">
          <TabsTrigger value="all" className="text-xs font-medium px-4 py-1.5">
            All Notifications
          </TabsTrigger>
          <TabsTrigger value="unread" className="text-xs font-medium px-4 py-1.5">
            Unread Only
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-2">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            <p className="text-sm">Loading notifications...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center bg-white dark:bg-slate-950 border rounded-xl py-16 px-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center mx-auto border border-gray-100 dark:border-gray-800">
              <Bell className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                No notifications found
              </p>
              <p className="text-xs text-gray-400">
                You are all caught up! There are no unread notifications right now.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((n) => {
              const isAnnouncement = n.type === "announcement";
              return (
                <Card
                  key={n.id}
                  className={`transition-all duration-200 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md ${
                    n.isRead
                      ? "opacity-60 bg-white dark:bg-slate-950"
                      : `bg-white dark:bg-slate-950 border-l-4 ${
                          isAnnouncement
                            ? "border-l-amber-500 bg-amber-50/5 dark:bg-amber-950/5"
                            : n.type === "class_reminder"
                            ? "border-l-emerald-500 bg-emerald-50/5 dark:bg-emerald-950/5"
                            : n.type === "private_message"
                            ? "border-l-sky-500 bg-sky-50/5 dark:bg-sky-950/5"
                            : n.type === "payment"
                            ? "border-l-rose-500 bg-rose-50/5 dark:bg-rose-950/5"
                            : "border-l-slate-500"
                        }`
                  }`}
                >
                  <CardContent className="p-4 flex items-start gap-4">
                    {/* Icon */}
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border border-gray-100/30 ${getIconBgColor(
                        n.type,
                        !!n.isRead
                      )}`}
                    >
                      {getNotificationIcon(n.type)}
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-gray-800 dark:text-gray-200">
                          {n.title}
                        </span>
                        {isAnnouncement && (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] px-1.5 py-0.2 font-normal rounded border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800">
                            Broadcast Notice
                          </Badge>
                        )}
                        {!n.isRead && !isAnnouncement && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed font-normal">
                        {n.message}
                      </p>

                      {/* Created Time */}
                      <p className="text-[10px] text-gray-400 mt-1.5 font-light">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>

                      {/* Action CTA Buttons based on Notification Types */}
                      {!n.isRead && (
                        <div className="flex items-center gap-2 pt-2.5">
                          {n.type === "class_reminder" && (
                            <Link to="/classes">
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1 rounded-md"
                              >
                                <Video className="w-3.5 h-3.5 mr-1" />
                                Join Class
                              </Button>
                            </Link>
                          )}
                          {n.type === "private_message" && (
                            <Link to="/messages">
                              <Button
                                size="sm"
                                className="bg-sky-600 hover:bg-sky-700 text-white text-xs px-3 py-1 rounded-md"
                              >
                                <MessageSquare className="w-3.5 h-3.5 mr-1" />
                                Open Chat
                              </Button>
                            </Link>
                          )}
                          {n.type === "payment" && (
                            <Link to="/fees">
                              <Button
                                size="sm"
                                className="bg-rose-600 hover:bg-rose-700 text-white text-xs px-3 py-1 rounded-md"
                              >
                                <CreditCard className="w-3.5 h-3.5 mr-1" />
                                Pay Fees
                              </Button>
                            </Link>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Mark read button */}
                      {!n.isRead && !isAnnouncement && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => markRead.mutate({ id: n.id as number })}
                          disabled={markRead.isPending}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50/50"
                          title="Mark read"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      )}

                      {/* Dismiss Announcement */}
                      {isAnnouncement && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            dismissAnnouncement.mutate({ announcementId: (n as any).realId })
                          }
                          disabled={dismissAnnouncement.isPending}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-amber-600 hover:bg-amber-50/50"
                          title="Dismiss"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}

                      {/* Delete button (for personal notifications) */}
                      {!isAnnouncement && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteNotification.mutate({ id: n.id as number })}
                          disabled={deleteNotification.isPending}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50/50"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Pagination / Load More */}
            {data?.nextCursor && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLimit((prev) => prev + 20)}
                  className="text-xs font-semibold px-6 py-2 border-gray-200 hover:bg-gray-50 text-gray-700"
                >
                  Load More
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
