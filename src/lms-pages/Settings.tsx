import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Settings, Bell, Shield, Zap, Lock, User, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/providers/trpc";
import { COUNTRY_CODES, validatePhoneNumber } from "@contracts/validation";

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "admin", "academic_head"].includes(user?.role || "");
  const isStudent = user?.role === "student";

  const myProfileQuery = trpc.user.myProfile.useQuery();
  const profile = myProfileQuery.data;

  // Profile Form States
  const [profileName, setProfileName] = useState("");
  const [profileCountryCode, setProfileCountryCode] = useState("+91");
  const [profilePhoneNumber, setProfilePhoneNumber] = useState("");
  const [profileUsername, setProfileUsername] = useState("");

  useEffect(() => {
    if (profile) {
      setProfileName(profile.name || "");
      setProfileCountryCode(profile.countryCode || "+91");
      setProfilePhoneNumber(profile.phoneNumber || "");
      setProfileUsername(profile.username || "");
    }
  }, [profile]);

  // Password Form States
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Notification States
  const [selectedDuration, setSelectedDuration] = useState<"1_hour" | "8_hours" | "24_hours" | "indefinite">("1_hour");

  // Feature flags — read from localStorage (env vars are server-side; show as read-only info)
  const [gamificationFlag, setGamificationFlag] = useState("false");
  const [aiInsightsFlag, setAiInsightsFlag] = useState("false");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setGamificationFlag(localStorage.getItem("FEATURE_GAMIFICATION") ?? "false");
      setAiInsightsFlag(localStorage.getItem("FEATURE_AI_INSIGHTS") ?? "false");
    }
  }, []);

  // Mutations
  const updateProfileMutation = trpc.user.updateMyProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated successfully");
      myProfileQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update profile");
    },
  });

  const changePasswordMutation = trpc.user.changeMyPassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to change password");
    },
  });

  const updateNotificationPauseMutation = trpc.user.updateNotificationPause.useMutation({
    onSuccess: (data) => {
      if (data.pausedUntil) {
        const date = new Date(data.pausedUntil);
        const dateString = date.getFullYear() >= 2099 ? "indefinitely" : `until ${date.toLocaleString()}`;
        toast.success(`Notifications paused ${dateString}`);
      } else {
        toast.success("Notifications resumed");
      }
      myProfileQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update notifications");
    },
  });

  // Handlers
  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!profileUsername.trim()) {
      toast.error("Username is required");
      return;
    }
    const error = validatePhoneNumber(profileCountryCode, profilePhoneNumber);
    if (error) {
      toast.error(error);
      return;
    }

    updateProfileMutation.mutate({
      name: profileName,
      username: profileUsername,
      countryCode: profileCountryCode,
      phoneNumber: profilePhoneNumber,
    });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Current password is required");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
      confirmPassword,
    });
  };

  const handlePauseNotifications = () => {
    updateNotificationPauseMutation.mutate({ pauseOption: selectedDuration });
  };

  const handleResumeNotifications = () => {
    updateNotificationPauseMutation.mutate({ pauseOption: "resume" });
  };

  const getPauseStatusText = () => {
    if (!profile?.notificationsPausedUntil) return "Active";
    const date = new Date(profile.notificationsPausedUntil);
    if (date.getTime() <= Date.now()) return "Active";
    if (date.getFullYear() >= 2099) return "Paused indefinitely";
    return `Paused until ${date.toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`;
  };

  const isPaused = profile?.notificationsPausedUntil && new Date(profile.notificationsPausedUntil).getTime() > Date.now();

  const tabLabel = user?.role === "teacher" ? "Teacher Profile" : "Profile Settings";

  if (myProfileQuery.isLoading) {
    return <p className="text-sm text-gray-500">Loading settings...</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-4 h-10 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg">
          <TabsTrigger value="profile" className="text-xs font-semibold flex items-center justify-center gap-1.5 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-950">
            <User className="w-3.5 h-3.5" />
            {tabLabel}
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs font-semibold flex items-center justify-center gap-1.5 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-950">
            <Lock className="w-3.5 h-3.5" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs font-semibold flex items-center justify-center gap-1.5 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-950">
            <Bell className="w-3.5 h-3.5" />
            Notifications
          </TabsTrigger>
          {isAdmin && user?.role !== "academic_head" && (
            <TabsTrigger value="feature-flags" className="hidden lg:flex text-xs font-semibold items-center justify-center gap-1.5 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-950">
              <Zap className="w-3.5 h-3.5" />
              Flags
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── Profile Settings ────────────────────────────────────────────────── */}
        <TabsContent value="profile">
          <form onSubmit={handleProfileSubmit}>
            <Card className="border border-gray-100 dark:border-gray-900 shadow-sm rounded-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                  <Settings className="w-5 h-5 text-emerald-600" />
                  {tabLabel}
                </CardTitle>
                <CardDescription>
                  Update your personal account information and contact details.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Full Name</Label>
                    <Input
                      id="profile-name"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-phone">Phone Number</Label>
                    <div className="flex gap-2">
                      <select
                        className="border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
                        value={profileCountryCode}
                        onChange={(e) => setProfileCountryCode(e.target.value)}
                      >
                        {COUNTRY_CODES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} ({c.country})
                          </option>
                        ))}
                      </select>
                      <Input
                        id="profile-phone"
                        className="flex-1"
                        value={profilePhoneNumber}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^\d*$/.test(val)) {
                            setProfilePhoneNumber(val);
                          }
                        }}
                        placeholder={`${COUNTRY_CODES.find((c) => c.code === profileCountryCode)?.length || 10} digits`}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-username">Username</Label>
                    <Input
                      id="profile-username"
                      value={profileUsername}
                      onChange={(e) => setProfileUsername(e.target.value)}
                      disabled={isStudent}
                      className={isStudent ? "bg-gray-50 dark:bg-gray-950 font-semibold opacity-70" : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>User ID (Unique ID)</Label>
                    <Input
                      value={profile?.unionId || ""}
                      disabled
                      className="bg-gray-50 dark:bg-gray-950 font-mono font-semibold opacity-70"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 h-9 text-sm"
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          </form>
        </TabsContent>

        {/* ─── Security ───────────────────────────────────────────────────────── */}
        <TabsContent value="security">
          <form onSubmit={handlePasswordSubmit}>
            <Card className="border border-gray-100 dark:border-gray-900 shadow-sm rounded-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                  <Shield className="w-5 h-5 text-emerald-600" />
                  Security Settings
                </CardTitle>
                <CardDescription>
                  Change your password to maintain the safety of your account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-pass">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current-pass"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-pass">New Password</Label>
                    <div className="relative">
                      <Input
                        id="new-pass"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-pass">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirm-pass"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 h-9 text-sm"
                  disabled={changePasswordMutation.isPending}
                >
                  {changePasswordMutation.isPending ? "Updating..." : "Change Password"}
                </Button>
              </CardContent>
            </Card>
          </form>
        </TabsContent>

        {/* ─── Notification Pause ──────────────────────────────────────────────── */}
        <TabsContent value="notifications">
          <Card className="border border-gray-100 dark:border-gray-900 shadow-sm rounded-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                <Bell className="w-5 h-5 text-emerald-600" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Temporarily pause alerts and push notifications for classes, messaging, and announcements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 dark:border-gray-900 bg-gray-50/50 dark:bg-gray-950/20">
                <div className="space-y-0.5">
                  <p className="font-semibold text-xs text-gray-400 uppercase tracking-wider">Current Status</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {getPauseStatusText()}
                  </p>
                </div>
                <div>
                  <Badge className={isPaused ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-emerald-100 text-emerald-700 border-emerald-200"}>
                    {isPaused ? "Paused" : "Active"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Pause Duration</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { value: "1_hour", label: "1 Hour" },
                      { value: "8_hours", label: "8 Hours" },
                      { value: "24_hours", label: "24 Hours" },
                      { value: "indefinite", label: "Indefinite" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedDuration(opt.value as any)}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all ${
                          selectedDuration === opt.value
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                            : "bg-white dark:bg-gray-950 border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    onClick={handlePauseNotifications}
                    disabled={updateNotificationPauseMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 h-9 text-sm"
                  >
                    Pause Notifications
                  </Button>
                  {isPaused && (
                    <Button
                      variant="outline"
                      onClick={handleResumeNotifications}
                      disabled={updateNotificationPauseMutation.isPending}
                      className="border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 text-sm h-9 px-4 rounded-lg"
                    >
                      Resume Notifications
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex gap-2 p-3.5 rounded-lg border border-amber-100 bg-amber-50/20 dark:bg-amber-950/10 dark:border-amber-900/30">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  <strong>Important Rule:</strong> Critical security notifications (e.g. password changes, account security alerts, login alerts) cannot be paused and will continue to alert you in real-time.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Feature Flags ──────────────────────────────────────────────────── */}
        {isAdmin && user?.role !== "academic_head" && (
          <TabsContent value="feature-flags">
            <Card className="border border-gray-100 dark:border-gray-900 shadow-sm rounded-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                  <Zap className="w-5 h-5 text-emerald-600" />
                  Feature Flags
                </CardTitle>
                <CardDescription>
                  These flags are controlled via environment variables on the server. The values shown reflect the current localStorage overrides (for reference only).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">FEATURE_GAMIFICATION</p>
                    <p className="text-sm text-gray-500">Enables attendance streak badges and gamification features</p>
                  </div>
                  <Badge variant={gamificationFlag === "true" ? "default" : "secondary"} className={gamificationFlag === "true" ? "bg-emerald-100 text-emerald-700" : ""}>
                    {gamificationFlag === "true" ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">FEATURE_AI_INSIGHTS</p>
                    <p className="text-sm text-gray-500">Enables at-risk student detection and teacher performance flags</p>
                  </div>
                  <Badge variant={aiInsightsFlag === "true" ? "default" : "secondary"} className={aiInsightsFlag === "true" ? "bg-emerald-100 text-emerald-700" : ""}>
                    {aiInsightsFlag === "true" ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
