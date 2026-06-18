import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import {
  Globe,
  BookOpen,
  MessageSquare,
  Briefcase,
  Trophy,
  BarChart2,
  Video,
  Bell,
  Plus,
  Trash2,
  Heart,
  Pin,
  Link as LinkIcon,
  FileText,
  Send,
  Bookmark,
  Eye,
  Calendar,
  Sparkles,
  CheckCircle,
  FileIcon,
  User,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const JitsiMeet = dynamic(() => import("@/components/JitsiMeet"), { ssr: false });

export default function CommunityPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // User Profile Query to check Completion Guard
  const myProfileQuery = trpc.user.myProfile.useQuery(undefined, { enabled: !!user });
  
  // Community endpoints queries
  const dashboardQuery = trpc.community.getDashboardData.useQuery(undefined, {
    enabled: !!user,
  });
  const lessonsQuery = trpc.community.listLessons.useQuery(undefined, {
    enabled: activeTab === "lessons" || activeTab === "dashboard",
  });
  const postsQuery = trpc.community.listPosts.useQuery(undefined, {
    enabled: activeTab === "forum" || activeTab === "dashboard",
  });
  const careersQuery = trpc.community.listCareers.useQuery(undefined, {
    enabled: activeTab === "careers" || activeTab === "dashboard",
  });
  const storiesQuery = trpc.community.listSuccessStories.useQuery(undefined, {
    enabled: activeTab === "success",
  });
  const analyticsQuery = trpc.community.getAnalytics.useQuery(undefined, {
    enabled: (activeTab === "analytics") && ["super_admin", "admin", "academic_head"].includes(user?.role || ""),
  });

  // Track user DAU on mount
  const trackActiveUserMutation = trpc.community.trackActiveUser.useMutation();
  useEffect(() => {
    if (user) {
      trackActiveUserMutation.mutate();
    }
  }, [user]);

  // Mutations
  const utils = trpc.useUtils();
  const createLessonMutation = trpc.community.createLesson.useMutation({
    onSuccess: () => {
      toast.success("Daily class session published successfully!");
      setLessonDialogOpen(false);
      resetLessonForm();
      utils.community.listLessons.invalidate();
      utils.community.getDashboardData.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const viewLessonMutation = trpc.community.viewLesson.useMutation({
    onSuccess: () => utils.community.listLessons.invalidate(),
  });

  const createPostMutation = trpc.community.createPost.useMutation({
    onSuccess: () => {
      toast.success("Forum post created successfully!");
      setPostDialogOpen(false);
      resetPostForm();
      utils.community.listPosts.invalidate();
      utils.community.getDashboardData.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deletePostMutation = trpc.community.deletePost.useMutation({
    onSuccess: () => {
      toast.success("Discussion post deleted.");
      utils.community.listPosts.invalidate();
      utils.community.getDashboardData.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const pinPostMutation = trpc.community.pinPost.useMutation({
    onSuccess: () => {
      toast.success("Post pin status updated.");
      utils.community.listPosts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const likePostMutation = trpc.community.likePost.useMutation({
    onSuccess: () => utils.community.listPosts.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const createCommentMutation = trpc.community.createComment.useMutation({
    onSuccess: () => {
      toast.success("Reply added.");
      setCommentContent("");
      utils.community.listComments.invalidate({ postId: activePostId || 0 });
      utils.community.listPosts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteCommentMutation = trpc.community.deleteComment.useMutation({
    onSuccess: () => {
      toast.success("Reply deleted.");
      utils.community.listComments.invalidate({ postId: activePostId || 0 });
      utils.community.listPosts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const createAnnouncementMutation = trpc.notification.createAnnouncement.useMutation({
    onSuccess: () => {
      toast.success("Announcement published successfully!");
      setAnnouncementDialogOpen(false);
      resetAnnouncementForm();
      utils.community.getDashboardData.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const scheduleSessionMutation = trpc.community.scheduleLiveSession.useMutation({
    onSuccess: () => {
      toast.success("Monthly live session scheduled!");
      setSessionDialogOpen(false);
      resetSessionForm();
      utils.community.getDashboardData.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const createCareerMutation = trpc.community.createCareer.useMutation({
    onSuccess: () => {
      toast.success("Career opportunity published!");
      setCareerDialogOpen(false);
      resetCareerForm();
      utils.community.listCareers.invalidate();
      utils.community.getDashboardData.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteCareerMutation = trpc.community.deleteCareer.useMutation({
    onSuccess: () => {
      toast.success("Opportunity deleted.");
      utils.community.listCareers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const saveCareerMutation = trpc.community.saveCareer.useMutation({
    onSuccess: () => utils.community.listCareers.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const createStoryMutation = trpc.community.createSuccessStory.useMutation({
    onSuccess: () => {
      toast.success("Student success story published!");
      setStoryDialogOpen(false);
      resetStoryForm();
      utils.community.listSuccessStories.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteStoryMutation = trpc.community.deleteSuccessStory.useMutation({
    onSuccess: () => {
      toast.success("Success story deleted.");
      utils.community.listSuccessStories.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // State Management
  const [activeClassId, setActiveClassId] = useState<number | null>(null);
  const [activePostId, setActivePostId] = useState<number | null>(null);
  const [commentContent, setCommentContent] = useState<string>("");
  const commentsQuery = trpc.community.listComments.useQuery(
    { postId: activePostId || 0 },
    { enabled: !!activePostId }
  );

  // Dialog Modals State
  const [lessonDialogOpen, setLessonDialogOpen] = useState<boolean>(false);
  const [postDialogOpen, setPostDialogOpen] = useState<boolean>(false);
  const [announcementDialogOpen, setAnnouncementDialogOpen] = useState<boolean>(false);
  const [sessionDialogOpen, setSessionDialogOpen] = useState<boolean>(false);
  const [careerDialogOpen, setCareerDialogOpen] = useState<boolean>(false);
  const [storyDialogOpen, setStoryDialogOpen] = useState<boolean>(false);

  // Forms State
  const [lessonForm, setLessonForm] = useState({
    title: "",
    description: "",
    type: "pdf" as "pdf" | "docx" | "ppt" | "pptx" | "video" | "youtube" | "text",
    contentUrl: "",
    youtubeUrl: "",
    textContent: "",
    fileName: "",
  });
  const resetLessonForm = () =>
    setLessonForm({
      title: "",
      description: "",
      type: "pdf",
      contentUrl: "",
      youtubeUrl: "",
      textContent: "",
      fileName: "",
    });

  const [postForm, setPostForm] = useState({
    title: "",
    content: "",
    mediaUrl: "",
    mediaName: "",
  });
  const resetPostForm = () =>
    setPostForm({
      title: "",
      content: "",
      mediaUrl: "",
      mediaName: "",
    });

  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    description: "",
    expiresAt: "",
  });
  const resetAnnouncementForm = () =>
    setAnnouncementForm({
      title: "",
      description: "",
      expiresAt: "",
    });

  const [sessionForm, setSessionForm] = useState({
    title: "",
    description: "",
    scheduledAt: "",
    duration: 60,
    teacherId: user?.id || 0,
  });
  const resetSessionForm = () =>
    setSessionForm({
      title: "",
      description: "",
      scheduledAt: "",
      duration: 60,
      teacherId: user?.id || 0,
    });

  const [careerForm, setCareerForm] = useState({
    title: "",
    company: "",
    type: "Job" as "Job" | "Internship" | "Freelance" | "Guidance",
    location: "",
    description: "",
    link: "",
  });
  const resetCareerForm = () =>
    setCareerForm({
      title: "",
      company: "",
      type: "Job",
      location: "",
      description: "",
      link: "",
    });

  const [storyForm, setStoryForm] = useState({
    studentName: "",
    courseCompleted: "",
    achievement: "",
    photoUrl: "",
    testimonial: "",
  });
  const resetStoryForm = () =>
    setStoryForm({
      studentName: "",
      courseCompleted: "",
      achievement: "",
      photoUrl: "",
      testimonial: "",
    });

  const [careersFilter, setCareersFilter] = useState<string>("all");

  // File Handlers (converts file to base64 string)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, target: "lesson" | "post" | "story") => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File limit is 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      if (target === "lesson") {
        setLessonForm((prev) => ({
          ...prev,
          contentUrl: base64,
          fileName: file.name,
        }));
      } else if (target === "post") {
        setPostForm((prev) => ({
          ...prev,
          mediaUrl: base64,
          mediaName: file.name,
        }));
      } else if (target === "story") {
        setStoryForm((prev) => ({
          ...prev,
          photoUrl: base64,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Completion Guard Verification
  if (myProfileQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const completionDate = myProfileQuery.data?.profile?.completionDate;
  const isStudent = user?.role === "student";
  const hasCompleted = completionDate !== null && completionDate !== undefined;

  // Access check
  if (isStudent && !hasCompleted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-2xl shadow-sm border border-red-100 max-w-xl mx-auto mt-10">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 border border-red-100">
          <Globe className="w-8 h-8 animate-pulse" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Lifetime Learning Circle Guard</h2>
        <p className="text-gray-500 text-sm mb-4">
          The Community Module is exclusively accessible for students who have successfully completed their courses and graduated. Keep studying hard to unlock lifetime circle perks!
        </p>
        <div className="text-xs text-gray-400 bg-gray-50 px-4 py-2 rounded-lg border">
          🎓 Your profile course status must be marked as "Completed".
        </div>
      </div>
    );
  }

  const isStaff = ["super_admin", "admin", "academic_head", "teacher"].includes(user?.role || "");
  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");

  // Dashboard calculations
  const dashboard = dashboardQuery.data;

  // Filter careers
  const filteredCareers = careersQuery.data?.filter((c) => {
    if (careersFilter === "saved") return c.isSaved;
    if (careersFilter !== "all" && c.type !== careersFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Dynamic Jitsi Meet Fullscreen Overlay */}
      {activeClassId && (
        <JitsiMeet
          classId={activeClassId}
          onClose={() => setActiveClassId(null)}
        />
      )}

      {/* Hero Welcome Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-800 to-emerald-600 text-white p-6 md:p-8 shadow-xl">
        <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 space-y-2 max-w-3xl">
          <div className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Lifetime Learning Circle
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Welcome to the EMTEES Alumni Community
          </h1>
          <p className="text-emerald-100 text-sm md:text-base leading-relaxed">
            Your learning journey doesn't end with graduation. Stay connected, explore daily micro-lessons, network on discussion boards, attend live masterclasses, and explore job matches.
          </p>
          <div className="flex flex-wrap gap-4 pt-3 text-xs md:text-sm font-semibold">
            <div className="flex items-center gap-1.5 bg-emerald-900/40 px-3 py-1.5 rounded-xl border border-emerald-500/20">
              <Globe className="w-4 h-4 text-emerald-300" />
              <span>Free Lifetime Access</span>
            </div>
            {dashboard?.totalMembers !== undefined && (
              <div className="flex items-center gap-1.5 bg-emerald-900/40 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                <User className="w-4 h-4 text-emerald-300" />
                <span>{dashboard.totalMembers} active alumni members</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Tabs Container */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white p-1.5 rounded-2xl shadow-sm border overflow-x-auto w-full justify-start md:justify-center flex flex-nowrap md:flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard" className="rounded-xl px-4 py-2.5 text-xs md:text-sm font-medium transition-all">
            <Globe className="w-4 h-4 mr-2" /> Feed
          </TabsTrigger>
          <TabsTrigger value="lessons" className="rounded-xl px-4 py-2.5 text-xs md:text-sm font-medium transition-all">
            <BookOpen className="w-4 h-4 mr-2" /> Daily Class
          </TabsTrigger>
          <TabsTrigger value="announcements" className="rounded-xl px-4 py-2.5 text-xs md:text-sm font-medium transition-all">
            <Bell className="w-4 h-4 mr-2" /> Announcements
          </TabsTrigger>
          <TabsTrigger value="forum" className="rounded-xl px-4 py-2.5 text-xs md:text-sm font-medium transition-all">
            <MessageSquare className="w-4 h-4 mr-2" /> Forum
          </TabsTrigger>
          <TabsTrigger value="sessions" className="rounded-xl px-4 py-2.5 text-xs md:text-sm font-medium transition-all">
            <Video className="w-4 h-4 mr-2" /> Live Sessions
          </TabsTrigger>
          <TabsTrigger value="careers" className="rounded-xl px-4 py-2.5 text-xs md:text-sm font-medium transition-all">
            <Briefcase className="w-4 h-4 mr-2" /> Careers Board
          </TabsTrigger>
          <TabsTrigger value="success" className="rounded-xl px-4 py-2.5 text-xs md:text-sm font-medium transition-all">
            <Trophy className="w-4 h-4 mr-2" /> Success Stories
          </TabsTrigger>
          {isStaff && (
            <TabsTrigger value="analytics" className="rounded-xl px-4 py-2.5 text-xs md:text-sm font-medium transition-all text-emerald-700 data-[state=active]:bg-emerald-50">
              <BarChart2 className="w-4 h-4 mr-2" /> Analytics
            </TabsTrigger>
          )}
        </TabsList>

        {/* 1. Feed / Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Col - Main Feed content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Today's Daily Class Spotlight */}
              <Card className="rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
                <CardHeader className="bg-emerald-50/50 pb-4 border-b border-emerald-100">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="bg-emerald-100/40 text-emerald-800 border-emerald-200 uppercase tracking-wider text-[10px]">
                      Daily Micro-Learning Session
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {dashboard?.todayLesson ? new Date(dashboard.todayLesson.publishedAt).toLocaleDateString(undefined, { dateStyle: "long" }) : "Today"}
                    </span>
                  </div>
                  <CardTitle className="text-xl font-bold text-gray-800 mt-2">
                    {dashboard?.todayLesson?.title || "Welcome to Today's Learning Session"}
                  </CardTitle>
                  <CardDescription className="text-gray-600 line-clamp-3">
                    {dashboard?.todayLesson?.description || "Explore our new lifetime learning space. Complete lesson modules are uploaded daily to keep your skills sharp."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 flex justify-between items-center">
                  <div className="text-sm text-gray-500">
                    {dashboard?.todayLesson ? (
                      <span className="flex items-center gap-1 capitalize">
                        Format: <strong className="text-emerald-700">{dashboard.todayLesson.type}</strong>
                      </span>
                    ) : (
                      "No daily class published yet today."
                    )}
                  </div>
                  {dashboard?.todayLesson && (
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs flex items-center"
                      onClick={() => {
                        viewLessonMutation.mutate({ lessonId: dashboard.todayLesson!.id });
                        setActiveTab("lessons");
                      }}
                    >
                      Open Lesson <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Recent Forum Discussions highlights */}
              <Card className="rounded-2xl border shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold">Recent Discussion Threads</CardTitle>
                    <CardDescription>Participate in alumni interactions, Q&As, and networks</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => setActiveTab("forum")}>
                    View Forums
                  </Button>
                </CardHeader>
                <CardContent className="divide-y p-0">
                  {dashboard?.recentPosts && dashboard.recentPosts.length > 0 ? (
                    dashboard.recentPosts.map((post) => (
                      <div
                        key={post.id}
                        onClick={() => {
                          setActivePostId(post.id);
                          setActiveTab("forum");
                        }}
                        className="p-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-start gap-3"
                      >
                        <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0 border uppercase">
                          {post.author.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-gray-800 truncate">
                            {post.title || "Untitled Discussion"}
                          </h4>
                          <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{post.content}</p>
                          <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
                            <span className="font-semibold text-gray-600">{post.author.name}</span>
                            <span>•</span>
                            <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-gray-400 text-sm">No forum posts yet. Join the conversation!</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Col - Sidebar/Quick Actions */}
            <div className="space-y-6">
              {/* Quick Actions (Admin/Teacher) */}
              {isStaff && (
                <Card className="rounded-2xl border border-emerald-100 bg-emerald-50/20 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold text-emerald-800 uppercase tracking-wider">
                      Management Panel
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button onClick={() => setLessonDialogOpen(true)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs flex items-center justify-start gap-2 h-10 shadow-sm">
                      <Plus className="w-4 h-4" /> Publish Daily Class
                    </Button>
                    <Button onClick={() => setAnnouncementDialogOpen(true)} variant="outline" className="w-full rounded-xl text-xs flex items-center justify-start gap-2 h-10 border-emerald-200 text-emerald-800 bg-white hover:bg-emerald-50">
                      <Bell className="w-4 h-4" /> Add Announcement
                    </Button>
                    <Button onClick={() => setSessionDialogOpen(true)} variant="outline" className="w-full rounded-xl text-xs flex items-center justify-start gap-2 h-10 border-emerald-200 text-emerald-800 bg-white hover:bg-emerald-50">
                      <Video className="w-4 h-4" /> Schedule Live Session
                    </Button>
                    {isAdmin && (
                      <>
                        <Button onClick={() => setCareerDialogOpen(true)} variant="outline" className="w-full rounded-xl text-xs flex items-center justify-start gap-2 h-10 border-emerald-200 text-emerald-800 bg-white hover:bg-emerald-50">
                          <Briefcase className="w-4 h-4" /> Post Career Opportunity
                        </Button>
                        <Button onClick={() => setStoryDialogOpen(true)} variant="outline" className="w-full rounded-xl text-xs flex items-center justify-start gap-2 h-10 border-emerald-200 text-emerald-800 bg-white hover:bg-emerald-50">
                          <Trophy className="w-4 h-4" /> Publish Success Story
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Upcoming Community Live Session */}
              <Card className="rounded-2xl border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-emerald-600" /> Upcoming Masterclasses
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {dashboard?.upcomingSessions && dashboard.upcomingSessions.length > 0 ? (
                    dashboard.upcomingSessions.map((session) => (
                      <div key={session.id} className="p-3 bg-gray-50 rounded-xl border space-y-2">
                        <div className="flex justify-between items-start">
                          <h4 className="text-xs font-bold text-gray-800 line-clamp-1">{session.title}</h4>
                          <Badge className="bg-emerald-100 text-emerald-800 text-[9px] border-none font-medium hover:bg-emerald-100">
                            {session.duration} mins
                          </Badge>
                        </div>
                        <p className="text-[10px] text-gray-500 line-clamp-2">{session.description}</p>
                        <div className="flex justify-between items-center text-[10px] text-gray-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-emerald-600" />
                            {new Date(session.scheduledAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                          </span>
                          <span className="font-semibold text-gray-600">Host: {session.teacher.name}</span>
                        </div>
                        <Button
                          onClick={() => setActiveClassId(session.id)}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] py-1.5 h-auto font-bold shadow-sm"
                        >
                          Join Live Masterclass
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-gray-400 text-xs">No live sessions scheduled. Check back soon!</div>
                  )}
                </CardContent>
              </Card>

              {/* Career Opportunities Highlight */}
              <Card className="rounded-2xl border shadow-sm">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-emerald-600" /> Hot Careers
                  </CardTitle>
                  <Button variant="link" className="text-xs text-emerald-600 h-auto p-0 font-bold" onClick={() => setActiveTab("careers")}>
                    View All
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dashboard?.recentCareers && dashboard.recentCareers.length > 0 ? (
                    dashboard.recentCareers.map((c) => (
                      <div key={c.id} className="p-3 border rounded-xl bg-white hover:bg-gray-50 cursor-pointer" onClick={() => setActiveTab("careers")}>
                        <div className="flex justify-between items-start">
                          <h4 className="text-xs font-bold text-gray-800">{c.title}</h4>
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                            {c.type}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-gray-500 font-semibold mt-0.5">{c.company} — {c.location}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-gray-400 text-xs">No career listings right now.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* 2. Daily Classes Tab */}
        <TabsContent value="lessons" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Daily One-Class Archive</h2>
              <p className="text-xs text-gray-500">Access daily worksheets, recordings, slides, and study guides</p>
            </div>
            {isStaff && (
              <Button onClick={() => setLessonDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Publish Class
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lessonsQuery.data && lessonsQuery.data.length > 0 ? (
              lessonsQuery.data.map((lesson) => (
                <Card key={lesson.id} className="rounded-2xl border shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden">
                  <div className="p-5 space-y-3">
                    <div className="flex justify-between items-center">
                      <Badge className="capitalize bg-emerald-50 text-emerald-700 border-none hover:bg-emerald-50 text-[10px] font-bold">
                        {lesson.type} Format
                      </Badge>
                      <span className="text-[10px] text-gray-400">
                        {new Date(lesson.publishedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-gray-800 line-clamp-1">{lesson.title}</h3>
                    <p className="text-xs text-gray-500 line-clamp-3">{lesson.description}</p>
                  </div>

                  <div className="px-5 pb-4 pt-3 border-t bg-gray-50 flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 flex items-center gap-1 font-semibold">
                      <Eye className="w-3.5 h-3.5" /> {lesson.views.length} views
                    </span>
                    <Button
                      onClick={() => {
                        viewLessonMutation.mutate({ lessonId: lesson.id });
                        // Download/view file action
                        if (lesson.type === "youtube" && lesson.youtubeUrl) {
                          window.open(lesson.youtubeUrl, "_blank");
                        } else if (lesson.contentUrl) {
                          const link = document.createElement("a");
                          link.href = lesson.contentUrl;
                          link.download = lesson.fileName || `daily-lesson-${lesson.id}`;
                          link.click();
                        } else if (lesson.type === "text" && lesson.textContent) {
                          toast.info(lesson.textContent, { duration: 8000 });
                        }
                      }}
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-xs border-emerald-200 text-emerald-800 hover:bg-emerald-50 bg-white"
                    >
                      {lesson.type === "youtube" ? "Watch Video" : lesson.type === "text" ? "Read Lesson" : "Download file"}
                    </Button>
                  </div>
                </Card>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-gray-400 bg-white border rounded-2xl">
                No daily learning classes published yet.
              </div>
            )}
          </div>
        </TabsContent>

        {/* 3. Announcements Tab */}
        <TabsContent value="announcements" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Community Announcement Board</h2>
              <p className="text-xs text-gray-500">Official directives and schedules from Emtees Administration</p>
            </div>
            {isStaff && (
              <Button onClick={() => setAnnouncementDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Add Announcement
              </Button>
            )}
          </div>

          <div className="space-y-4 max-w-4xl mx-auto">
            {dashboard?.announcements && dashboard.announcements.length > 0 ? (
              dashboard.announcements.map((a) => (
                <Card key={a.id} className="rounded-2xl border border-emerald-100 shadow-sm relative overflow-hidden bg-emerald-50/10">
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-600"></div>
                  <CardHeader className="pl-6 pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-base font-bold text-gray-800">{a.title}</CardTitle>
                      <span className="text-[10px] text-gray-400">
                        {new Date(a.createdAt).toLocaleDateString(undefined, { dateStyle: "long" })}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pl-6 pb-5 text-xs text-gray-600 whitespace-pre-line leading-relaxed">
                    {a.description}
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-12 text-gray-400 bg-white border rounded-2xl">
                No active announcements on the board right now.
              </div>
            )}
          </div>
        </TabsContent>

        {/* 4. Discussion Forum Tab */}
        <TabsContent value="forum" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Alumni Discussion Forum</h2>
              <p className="text-xs text-gray-500">Discuss courses, projects, career updates, and share advice</p>
            </div>
            <Button onClick={() => setPostDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Create Thread
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Posts/Threads List */}
            <div className="lg:col-span-2 space-y-4">
              {postsQuery.data && postsQuery.data.length > 0 ? (
                postsQuery.data.map((post) => {
                  const isActive = activePostId === post.id;
                  return (
                    <Card
                      key={post.id}
                      className={`rounded-2xl border transition-all cursor-pointer overflow-hidden ${
                        isActive ? "border-emerald-500 ring-1 ring-emerald-500/20 bg-emerald-50/5" : "hover:border-gray-300 shadow-sm"
                      }`}
                      onClick={() => setActivePostId(post.id)}
                    >
                      <div className="p-5 space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-800 border uppercase shrink-0">
                              {post.author.name[0]}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                                {post.author.name}{" "}
                                <Badge variant="secondary" className="text-[9px] font-normal capitalize">
                                  {post.author.role.replace(/_/g, " ")}
                                </Badge>
                              </h4>
                              <p className="text-[10px] text-gray-400">
                                {new Date(post.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {post.isPinned && (
                              <Badge className="bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1 text-[9px] hover:bg-amber-50 shadow-none font-bold">
                                <Pin className="w-3 h-3 fill-amber-800" /> Pinned
                              </Badge>
                            )}
                            {isAdmin && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="w-8 h-8 rounded-full text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  pinPostMutation.mutate({ id: post.id, pin: !post.isPinned });
                                }}
                              >
                                <Pin className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {(post.authorId === user?.id || isStaff) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="w-8 h-8 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("Delete this post?")) {
                                    deletePostMutation.mutate({ id: post.id });
                                    if (isActive) setActivePostId(null);
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {post.title && <h3 className="text-base font-bold text-gray-800">{post.title}</h3>}
                        <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{post.content}</p>

                        {post.mediaUrl && (
                          <div className="border rounded-xl p-2 bg-gray-50 max-w-sm flex items-center justify-between gap-3 overflow-hidden">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileIcon className="w-6 h-6 text-emerald-600 shrink-0" />
                              <span className="text-[10px] text-gray-500 font-semibold truncate">{post.mediaName || "Attachment"}</span>
                            </div>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                const link = document.createElement("a");
                                link.href = post.mediaUrl!;
                                link.download = post.mediaName || "attachment";
                                link.click();
                              }}
                              size="sm"
                              variant="outline"
                              className="text-[9px] h-7 px-2 rounded-lg bg-white"
                            >
                              Download
                            </Button>
                          </div>
                        )}

                        <div className="flex gap-4 text-xs pt-2 border-t">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              likePostMutation.mutate({ postId: post.id });
                            }}
                            className={`flex items-center gap-1.5 transition-colors font-bold ${
                              post.isLiked ? "text-red-500" : "text-gray-400 hover:text-gray-600"
                            }`}
                          >
                            <Heart className={`w-4 h-4 ${post.isLiked ? "fill-red-500" : ""}`} />
                            <span>{post.likesCount}</span>
                          </button>
                          <span className="flex items-center gap-1.5 text-gray-400">
                            <MessageSquare className="w-4 h-4" />
                            <span>{post.commentsCount} replies</span>
                          </span>
                        </div>
                      </div>
                    </Card>
                  );
                })
              ) : (
                <div className="text-center py-12 text-gray-400 bg-white border rounded-2xl">
                  No discussion threads yet. Start one!
                </div>
              )}
            </div>

            {/* Comments/Replies Sidebar */}
            <div className="lg:col-span-1">
              <Card className="rounded-2xl border shadow-sm sticky top-24 min-h-[400px] flex flex-col justify-between overflow-hidden">
                <div>
                  <CardHeader className="bg-gray-50 border-b pb-4">
                    <CardTitle className="text-sm font-bold text-gray-800">Thread Replies</CardTitle>
                    <CardDescription>
                      {activePostId ? "Add or view comments under this thread" : "Select a thread to view discussion comments"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 overflow-y-auto max-h-[350px]">
                    {activePostId ? (
                      commentsQuery.isLoading ? (
                        <div className="p-6 text-center text-xs text-gray-400">Loading replies...</div>
                      ) : commentsQuery.data && commentsQuery.data.length > 0 ? (
                        <div className="divide-y">
                          {commentsQuery.data.map((c) => (
                            <div key={c.id} className="p-4 space-y-2">
                              <div className="flex justify-between items-start">
                                <span className="text-[10px] font-bold text-emerald-800">
                                  {c.author.name}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] text-gray-400">
                                    {new Date(c.createdAt).toLocaleDateString()}
                                  </span>
                                  {(c.authorId === user?.id || isStaff) && (
                                    <button
                                      onClick={() => {
                                        if (confirm("Delete this reply?")) {
                                          deleteCommentMutation.mutate({ id: c.id });
                                        }
                                      }}
                                      className="text-red-500 hover:text-red-600"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="text-[11px] text-gray-600 leading-relaxed">{c.content}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 text-center text-xs text-gray-400">No replies yet. Be the first!</div>
                      )
                    ) : (
                      <div className="p-10 text-center text-gray-400 text-xs">No discussion thread active.</div>
                    )}
                  </CardContent>
                </div>

                {activePostId && (
                  <div className="p-3 border-t bg-gray-50 flex gap-2 items-center">
                    <Input
                      placeholder="Write a reply..."
                      value={commentContent}
                      onChange={(e) => setCommentContent(e.target.value)}
                      className="rounded-xl text-xs bg-white h-9"
                    />
                    <Button
                      size="icon"
                      disabled={createCommentMutation.isPending || !commentContent.trim()}
                      onClick={() =>
                        createCommentMutation.mutate({ postId: activePostId, content: commentContent })
                      }
                      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl w-9 h-9"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* 5. Live Sessions Tab */}
        <TabsContent value="sessions" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Monthly Live Masterclasses</h2>
              <p className="text-xs text-gray-500">Join interactive sessions hosted directly via the LMS</p>
            </div>
            {isStaff && (
              <Button onClick={() => setSessionDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Schedule Masterclass
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {dashboard?.upcomingSessions && dashboard.upcomingSessions.length > 0 ? (
              dashboard.upcomingSessions.map((session) => (
                <Card key={session.id} className="rounded-2xl border border-emerald-100 shadow-sm overflow-hidden flex flex-col justify-between bg-emerald-50/5">
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <Badge className="bg-emerald-100 text-emerald-800 border-none font-bold text-[9px] hover:bg-emerald-100">
                          {session.duration} minutes
                        </Badge>
                        <h3 className="text-base font-bold text-gray-800 pt-1">{session.title}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-800 text-xs">
                          {session.teacher.name[0]}
                        </div>
                        <span className="text-xs text-gray-500 font-semibold">{session.teacher.name}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{session.description}</p>
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-2 rounded-xl">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>
                        {new Date(session.scheduledAt).toLocaleString(undefined, {
                          dateStyle: "full",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
                    <Button
                      onClick={() => setActiveClassId(session.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs shadow-sm font-semibold"
                    >
                      Join Session Now
                    </Button>
                  </div>
                </Card>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-gray-400 bg-white border rounded-2xl">
                No monthly live masterclasses scheduled at the moment. Check back later!
              </div>
            )}
          </div>
        </TabsContent>

        {/* 6. Careers Board Tab */}
        <TabsContent value="careers" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Careers & Opportunities board</h2>
              <p className="text-xs text-gray-500">Apply for exclusive alumni matches, freelance contracts, and guidance workshops</p>
            </div>
            <div className="flex gap-2">
              {isAdmin && (
                <Button onClick={() => setCareerDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Add Opportunity
                </Button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 pb-2">
            {["all", "Job", "Internship", "Freelance", "Guidance", "saved"].map((f) => (
              <Button
                key={f}
                variant={careersFilter === f ? "default" : "outline"}
                onClick={() => setCareersFilter(f)}
                className={`rounded-xl text-xs px-4 h-8 capitalize ${
                  careersFilter === f ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                }`}
              >
                {f === "saved" ? "Saved Items" : f}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCareers && filteredCareers.length > 0 ? (
              filteredCareers.map((c) => (
                <Card key={c.id} className="rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div className="p-5 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-base font-bold text-gray-800 line-clamp-1">{c.title}</h3>
                        <p className="text-xs text-emerald-700 font-semibold mt-0.5">
                          {c.company} — <span className="text-gray-500 font-normal">{c.location}</span>
                        </p>
                      </div>
                      <Badge variant="secondary" className="capitalize text-[10px] py-0 px-2">
                        {c.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-4 leading-relaxed">{c.description}</p>
                  </div>

                  <div className="px-5 pb-4 pt-3 border-t bg-gray-50 flex justify-between items-center">
                    <button
                      onClick={() => saveCareerMutation.mutate({ careerId: c.id })}
                      className={`flex items-center gap-1 text-xs font-semibold ${
                        c.isSaved ? "text-emerald-700" : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      <Bookmark className={`w-4 h-4 ${c.isSaved ? "fill-emerald-700 text-emerald-700" : ""}`} />
                      <span>{c.isSaved ? "Saved" : "Save"}</span>
                    </button>

                    <div className="flex gap-2">
                      {isAdmin && (
                        <Button
                          onClick={() => {
                            if (confirm("Delete opportunity?")) deleteCareerMutation.mutate({ id: c.id });
                          }}
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8 rounded-lg text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      {c.link && (
                        <Button
                          onClick={() => window.open(c.link || undefined, "_blank")}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs py-1 h-8 px-3"
                        >
                          Apply Now
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-gray-400 bg-white border rounded-2xl">
                No matching opportunities listed on the board.
              </div>
            )}
          </div>
        </TabsContent>

        {/* 7. Success Stories Tab */}
        <TabsContent value="success" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Alumni Spotlights & Success Stories</h2>
              <p className="text-xs text-gray-500">Inspiring career transitions and achievements of Emtees Academy alumni</p>
            </div>
            {isAdmin && (
              <Button onClick={() => setStoryDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Add Story
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {storiesQuery.data && storiesQuery.data.length > 0 ? (
              storiesQuery.data.map((story) => (
                <Card key={story.id} className="rounded-2xl border shadow-sm overflow-hidden flex flex-col md:flex-row bg-white">
                  {story.photoUrl && (
                    <div className="md:w-48 h-48 md:h-full shrink-0 relative bg-emerald-50">
                      <img src={story.photoUrl} alt={story.studentName} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-6 flex flex-col justify-between flex-1 min-w-0">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-base font-extrabold text-gray-800">{story.studentName}</h3>
                          <p className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider">
                            Course: {story.courseCompleted}
                          </p>
                        </div>
                        {isAdmin && (
                          <Button
                            onClick={() => {
                              if (confirm("Delete success story?")) deleteStoryMutation.mutate({ id: story.id });
                            }}
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7 rounded-full text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg p-2 font-bold flex items-center gap-1">
                        🏆 {story.achievement}
                      </div>
                      <p className="text-xs text-gray-500 italic leading-relaxed">"{story.testimonial}"</p>
                    </div>
                    <span className="text-[9px] text-gray-400 self-end">
                      Published on {new Date(story.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Card>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-gray-400 bg-white border rounded-2xl">
                No alumni success stories published yet.
              </div>
            )}
          </div>
        </TabsContent>

        {/* 8. Analytics Tab (Staff only) */}
        {isStaff && (
          <TabsContent value="analytics" className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Community Analytics Panel</h2>
              <p className="text-xs text-gray-500">Track alumni engagement, active metrics, views, and attendance rates</p>
            </div>

            {analyticsQuery.data ? (
              <div className="space-y-6">
                {/* Stats grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="rounded-2xl border p-5 space-y-2">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total Members</span>
                    <h3 className="text-3xl font-extrabold text-emerald-700">{analyticsQuery.data.totalMembers}</h3>
                  </Card>
                  <Card className="rounded-2xl border p-5 space-y-2">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Discussion Posts</span>
                    <h3 className="text-3xl font-extrabold text-gray-800">
                      {analyticsQuery.data.discussionActivity.posts}
                    </h3>
                  </Card>
                  <Card className="rounded-2xl border p-5 space-y-2">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Discussion Comments</span>
                    <h3 className="text-3xl font-extrabold text-gray-800">
                      {analyticsQuery.data.discussionActivity.comments}
                    </h3>
                  </Card>
                  <Card className="rounded-2xl border p-5 space-y-2">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Live Classes Scheduled</span>
                    <h3 className="text-3xl font-extrabold text-emerald-700">
                      {analyticsQuery.data.liveSessionAttendance.totalClasses}
                    </h3>
                  </Card>
                </div>

                {/* DAU Chart and Lesson Views */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* DAU Chart */}
                  <Card className="rounded-2xl border p-5">
                    <div className="flex items-center gap-1.5 mb-4">
                      <TrendingUp className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-sm font-bold text-gray-800">Daily Active Users Trend</h3>
                    </div>
                    <div className="h-64 w-full">
                      {analyticsQuery.data.activeTrend.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={analyticsQuery.data.activeTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="dauGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            <XAxis dataKey="activeDate" stroke="#9ca3af" fontSize={10} />
                            <YAxis stroke="#9ca3af" fontSize={10} />
                            <Tooltip />
                            <Area type="monotone" dataKey="count" name="Active Members" stroke="#059669" strokeWidth={2} fillOpacity={1} fill="url(#dauGrad)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-xs text-gray-400">No active trend logged yet.</div>
                      )}
                    </div>
                  </Card>

                  {/* Daily Lesson Views Tally */}
                  <Card className="rounded-2xl border p-5">
                    <h3 className="text-sm font-bold text-gray-800 mb-4">Daily One-Class Views Tally</h3>
                    <div className="divide-y max-h-64 overflow-y-auto">
                      {analyticsQuery.data.lessonViews.length > 0 ? (
                        analyticsQuery.data.lessonViews.map((view) => (
                          <div key={view.lessonId} className="py-2.5 flex justify-between items-center text-xs">
                            <span className="font-semibold text-gray-700 truncate max-w-[280px]">{view.lessonTitle}</span>
                            <Badge className="bg-emerald-50 text-emerald-700 border-none font-bold">{view.viewsCount} views</Badge>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-10 text-gray-400 text-xs">No daily class views logged yet.</div>
                      )}
                    </div>
                  </Card>
                </div>

                {/* Engagement Leaderboard */}
                <Card className="rounded-2xl border p-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-1.5">
                    <Trophy className="w-5 h-5 text-amber-500" /> Community Engagement Leaderboard
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analyticsQuery.data.engagedMembers.map((member, index) => (
                      <div key={member.id} className="p-3 bg-gray-50 rounded-xl border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-gray-400 w-5">#{index + 1}</span>
                          <div>
                            <h4 className="text-xs font-bold text-gray-800">{member.name}</h4>
                            <p className="text-[9px] text-gray-400 font-semibold">
                              {member.postsCount} posts • {member.commentsCount} replies • {member.viewsCount} reads
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-emerald-600 text-white border-none font-bold text-[10px]">
                          Score: {member.score}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">Loading metrics...</div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ==================== dialog MODALS ==================== */}

      {/* 1. Add Daily Lesson Modal */}
      <Dialog open={lessonDialogOpen} onOpenChange={setLessonDialogOpen}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle>Publish Daily Learning Session</DialogTitle>
            <DialogDescription>Add worksheets, video lectures, youtube links or text lessons for permanent alumni access.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Title *</label>
              <Input
                placeholder="E.g. Advanced English Speaking Guide"
                value={lessonForm.title}
                onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Description</label>
              <Textarea
                placeholder="Micro-learning context summary..."
                value={lessonForm.description}
                onChange={(e) => setLessonForm({ ...lessonForm, description: e.target.value })}
                className="rounded-xl resize-none h-20"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Format Type *</label>
                <select
                  value={lessonForm.type}
                  onChange={(e) => setLessonForm({ ...lessonForm, type: e.target.value as any })}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm"
                >
                  <option value="pdf">PDF File</option>
                  <option value="docx">DOCX Worksheets</option>
                  <option value="ppt">PPT Slides</option>
                  <option value="pptx">PPTX Slides</option>
                  <option value="video">Recorded Video</option>
                  <option value="youtube">YouTube Link</option>
                  <option value="text">Text Lesson</option>
                </select>
              </div>

              {lessonForm.type === "youtube" ? (
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">YouTube URL *</label>
                  <Input
                    placeholder="https://youtube.com/watch?..."
                    value={lessonForm.youtubeUrl}
                    onChange={(e) => setLessonForm({ ...lessonForm, youtubeUrl: e.target.value })}
                    className="rounded-xl bg-white"
                  />
                </div>
              ) : lessonForm.type === "text" ? (
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">Quick Lesson Content *</label>
                  <Input
                    placeholder="Lesson text..."
                    value={lessonForm.textContent}
                    onChange={(e) => setLessonForm({ ...lessonForm, textContent: e.target.value })}
                    className="rounded-xl bg-white"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">Upload File (Max 10MB) *</label>
                  <div className="relative">
                    <input
                      type="file"
                      accept={lessonForm.type === "video" ? "video/*" : ".pdf,.docx,.ppt,.pptx"}
                      onChange={(e) => handleFileChange(e, "lesson")}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Button variant="outline" className="w-full text-xs rounded-xl flex items-center justify-start gap-2 h-10 border-dashed truncate">
                      <FileIcon className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="truncate">{lessonForm.fileName || "Choose file..."}</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setLessonDialogOpen(false)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!lessonForm.title) {
                  toast.error("Please fill in the title");
                  return;
                }
                createLessonMutation.mutate(lessonForm);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs"
              disabled={createLessonMutation.isPending}
            >
              Publish Lesson
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Add Announcement Modal */}
      <Dialog open={announcementDialogOpen} onOpenChange={setAnnouncementDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Add Community Announcement</DialogTitle>
            <DialogDescription>Announcements display prominently at the top of the community page dashboard.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Title *</label>
              <Input
                placeholder="Important community directive title"
                value={announcementForm.title}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Description *</label>
              <Textarea
                placeholder="Announcement message content..."
                value={announcementForm.description}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, description: e.target.value })}
                className="rounded-xl resize-none h-28"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Expiration Date (Optional)</label>
              <Input
                type="date"
                value={announcementForm.expiresAt}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, expiresAt: e.target.value })}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setAnnouncementDialogOpen(false)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!announcementForm.title || !announcementForm.description) {
                  toast.error("Please fill in all required fields.");
                  return;
                }
                createAnnouncementMutation.mutate({
                  ...announcementForm,
                  audienceType: "batch",
                  audienceId: dashboard?.batchId,
                });
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs"
              disabled={createAnnouncementMutation.isPending}
            >
              Add Announcement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Create Discussion Thread Modal */}
      <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Start Discussion Thread</DialogTitle>
            <DialogDescription>Share notes, project opportunities, or ask questions to the circle.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Thread Title (Optional)</label>
              <Input
                placeholder="E.g., Freelance design contract template"
                value={postForm.title}
                onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Content Message *</label>
              <Textarea
                placeholder="Write your discussion post..."
                value={postForm.content}
                onChange={(e) => setPostForm({ ...postForm, content: e.target.value })}
                className="rounded-xl resize-none h-28"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Attach File/Image (Optional, Max 10MB)</label>
              <div className="relative">
                <input
                  type="file"
                  onChange={(e) => handleFileChange(e, "post")}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button variant="outline" className="w-full text-xs rounded-xl flex items-center justify-start gap-2 h-10 border-dashed truncate">
                  <FileIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate">{postForm.mediaName || "Select file attachment..."}</span>
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setPostDialogOpen(false)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!postForm.content) {
                  toast.error("Please fill in the discussion content.");
                  return;
                }
                createPostMutation.mutate(postForm);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs"
              disabled={createPostMutation.isPending}
            >
              Post Thread
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Schedule Live Class Modal */}
      <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Live Masterclass</DialogTitle>
            <DialogDescription>This session will show in community masterclass panels and send alerts to graduated members.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Session Title *</label>
              <Input
                placeholder="E.g., IELTS Academic Speaking Masterclass"
                value={sessionForm.title}
                onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Session Description</label>
              <Textarea
                placeholder="What will students learn in this live class?"
                value={sessionForm.description}
                onChange={(e) => setSessionForm({ ...sessionForm, description: e.target.value })}
                className="rounded-xl resize-none h-20"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Scheduled Date & Time *</label>
                <Input
                  type="datetime-local"
                  value={sessionForm.scheduledAt}
                  onChange={(e) => setSessionForm({ ...sessionForm, scheduledAt: e.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Duration (Minutes) *</label>
                <Input
                  type="number"
                  value={sessionForm.duration}
                  onChange={(e) => setSessionForm({ ...sessionForm, duration: Number(e.target.value) })}
                  className="rounded-xl"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setSessionDialogOpen(false)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!sessionForm.title || !sessionForm.scheduledAt) {
                  toast.error("Please fill in all required fields.");
                  return;
                }
                scheduleSessionMutation.mutate({
                  ...sessionForm,
                  scheduledAt: new Date(sessionForm.scheduledAt),
                });
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs"
              disabled={scheduleSessionMutation.isPending}
            >
              Schedule Live Class
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. Add Career Opportunity Modal */}
      <Dialog open={careerDialogOpen} onOpenChange={setCareerDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Post Career Opportunity</DialogTitle>
            <DialogDescription>Publish job matching roles, internships, or freelance projects for alumni members.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Title *</label>
                <Input
                  placeholder="E.g., Junior Content Writer"
                  value={careerForm.title}
                  onChange={(e) => setCareerForm({ ...careerForm, title: e.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Company *</label>
                <Input
                  placeholder="E.g., Emtees Academy Ltd"
                  value={careerForm.company}
                  onChange={(e) => setCareerForm({ ...careerForm, company: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Classification *</label>
                <select
                  value={careerForm.type}
                  onChange={(e) => setCareerForm({ ...careerForm, type: e.target.value as any })}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm"
                >
                  <option value="Job">Job Role</option>
                  <option value="Internship">Internship</option>
                  <option value="Freelance">Freelance Contract</option>
                  <option value="Guidance">Career Guidance Workshop</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Location *</label>
                <Input
                  placeholder="Remote / Cochin, Kerala"
                  value={careerForm.location}
                  onChange={(e) => setCareerForm({ ...careerForm, location: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Description *</label>
              <Textarea
                placeholder="Job description details..."
                value={careerForm.description}
                onChange={(e) => setCareerForm({ ...careerForm, description: e.target.value })}
                className="rounded-xl resize-none h-20"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Application URL Link (Optional)</label>
              <Input
                placeholder="https://careers.company.com/apply/..."
                value={careerForm.link}
                onChange={(e) => setCareerForm({ ...careerForm, link: e.target.value })}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setCareerDialogOpen(false)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!careerForm.title || !careerForm.company || !careerForm.description || !careerForm.location) {
                  toast.error("Please fill in all required fields.");
                  return;
                }
                createCareerMutation.mutate(careerForm);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs"
              disabled={createCareerMutation.isPending}
            >
              Publish Opportunity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. Add Success Story Modal */}
      <Dialog open={storyDialogOpen} onOpenChange={setStoryDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Publish Alumni Success Story</DialogTitle>
            <DialogDescription>Feature a graduate alumni student spotlight story on the community showcase card decks.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Graduate Student Name *</label>
                <Input
                  placeholder="E.g., Akhil P"
                  value={storyForm.studentName}
                  onChange={(e) => setStoryForm({ ...storyForm, studentName: e.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Course Completed *</label>
                <Input
                  placeholder="E.g., Business English Mastery"
                  value={storyForm.courseCompleted}
                  onChange={(e) => setStoryForm({ ...storyForm, courseCompleted: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Achievement Details *</label>
              <Input
                placeholder="E.g., Placed as Technical Writer at TechCorp / IELTS 8.5 Band"
                value={storyForm.achievement}
                onChange={(e) => setStoryForm({ ...storyForm, achievement: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Testimonial Quote *</label>
              <Textarea
                placeholder="Personal feedback or testimonial..."
                value={storyForm.testimonial}
                onChange={(e) => setStoryForm({ ...storyForm, testimonial: e.target.value })}
                className="rounded-xl resize-none h-20"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Student Photo Profile (Optional)</label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, "story")}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button variant="outline" className="w-full text-xs rounded-xl flex items-center justify-start gap-2 h-10 border-dashed truncate">
                  <FileIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate">{storyForm.photoUrl ? "Image Loaded" : "Choose profile image..."}</span>
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setStoryDialogOpen(false)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!storyForm.studentName || !storyForm.courseCompleted || !storyForm.achievement || !storyForm.testimonial) {
                  toast.error("Please fill in all required fields.");
                  return;
                }
                createStoryMutation.mutate(storyForm);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs"
              disabled={createStoryMutation.isPending}
            >
              Publish spotlight
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
