import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { isValidPhone, PHONE_ERROR_MESSAGE } from "@contracts/validation";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [tab, setTab] = useState("password");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    if (reason) {
      toast.error(reason, { duration: 5000 });
      // Remove query parameter without reload
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  const sendOtp = trpc.auth.sendOtp.useMutation({
    onSuccess: (data) => {
      toast.success(`OTP sent! (Demo: ${data.code})`);
    },
    onError: (err) => toast.error(err.message),
  });

  const verifyOtp = trpc.auth.verifyOtp.useMutation({
    onSuccess: (data) => {
      login(data);
      toast.success("Logged in with OTP");
      router.push("/");
    },
    onError: (err) => toast.error(err.message),
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      login(data);
      toast.success("Logged in successfully");
      router.push("/");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    const deviceToken = `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    loginMutation.mutate({ username, password, deviceToken });
  };

  const handleOtpVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !otp) return;
    const deviceToken = `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    verifyOtp.mutate({ phone, code: otp, deviceToken });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-emerald-700">EMTEES Academy</CardTitle>
          <p className="text-sm text-gray-500">Learning Management System</p>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="password">Username</TabsTrigger>
              <TabsTrigger value="otp">OTP</TabsTrigger>
            </TabsList>
            <TabsContent value="password">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
                <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? "Logging in..." : "Login"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="otp">
              <form onSubmit={handleOtpVerify} className="space-y-4 mt-4">
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    <Button type="button" variant="outline" onClick={() => sendOtp.mutate({ phone })} disabled={sendOtp.isPending || !isValidPhone(phone)}>
                      Send
                    </Button>
                  </div>
                  {phone && !isValidPhone(phone) && (
                    <p className="text-xs text-red-500">{PHONE_ERROR_MESSAGE}</p>
                  )}
                </div>
                <Input placeholder="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} />
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={verifyOtp.isPending || !phone || !isValidPhone(phone) || !otp}>
                  Verify & Login
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
