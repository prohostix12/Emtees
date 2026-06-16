import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldAlert, LogOut, Eye, EyeOff } from "lucide-react";

export default function ForceChangePassword() {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const changePasswordMutation = trpc.user.changeMyPassword.useMutation({
    onSuccess: () => {
      toast.success("Password updated successfully. Unlocking account...");
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update password");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error("Please enter your current temporary password");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match");
      return;
    }

    if (newPassword === currentPassword) {
      toast.error("New password cannot be the same as your temporary password");
      return;
    }

    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
      confirmPassword,
    });
  };

  const isInvalid = !currentPassword || newPassword.length < 6 || newPassword !== confirmPassword || newPassword === currentPassword;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="max-w-md w-full space-y-6 p-8 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Password Change Required
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            For security reasons, you must update your temporary password before accessing your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Temporary Password</Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrent ? "text" : "password"}
                placeholder="Enter temporary password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? "text" : "password"}
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword && newPassword.length < 6 && (
              <p className="text-xs text-red-500">Password must be at least 6 characters.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500">Passwords do not match.</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded-lg transition"
            disabled={changePasswordMutation.isPending || isInvalid}
          >
            {changePasswordMutation.isPending ? "Updating Password..." : "Update Password & Continue"}
          </Button>
        </form>

        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <Button
            variant="ghost"
            onClick={logout}
            className="w-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
