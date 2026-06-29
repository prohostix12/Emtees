"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { GraduationCap, ArrowRight, UserCheck, ShieldCheck } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";

const PREFERRED_TIME_SLOTS = [
  "7:00 AM",
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "2:00 PM",
  "4:00 PM",
  "6:00 PM",
  "7:00 PM",
  "8:00 PM"
];

export default function AdmissionPage() {
  const params = useParams();
  const router = useRouter();
  const referralCode = (params.code as string) || "";

  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [countryISO, setCountryISO] = useState("IN");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [qualificationId, setQualificationId] = useState<string>("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [oneOnOneEnabled, setOneOnOneEnabled] = useState(false);
  const [groupSessionEnabled, setGroupSessionEnabled] = useState(false);
  const [preferredClassTime, setPreferredClassTime] = useState("");
  const [gender, setGender] = useState("");
  const [paymentOption, setPaymentOption] = useState<"full_payment" | "installment">("full_payment");
  const [dob, setDob] = useState("");
  const [educationalQualification, setEducationalQualification] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentCountryCode, setParentCountryCode] = useState("+91");
  const [parentCountryISO, setParentCountryISO] = useState("IN");
  const [parentPhoneNumber, setParentPhoneNumber] = useState("");

  const [registeredStudent, setRegisteredStudent] = useState<{ studentId: string; name: string } | null>(null);

  // Fetch courses and referral details
  const referralInfoQuery = trpc.salesExecutive.getReferralInfo.useQuery(
    { referralCode },
    {
      enabled: !!referralCode,
      retry: false,
    }
  );

  const activeQualificationsQuery = trpc.qualifications.listActive.useQuery();

  useEffect(() => {
    if (referralInfoQuery.error) {
      toast.error(referralInfoQuery.error.message || "Invalid or expired referral link.");
    }
  }, [referralInfoQuery.error]);

  const registerMutation = trpc.salesExecutive.registerStudentWithReferral.useMutation({
    onSuccess: (data) => {
      toast.success("Registration successful!");
      setRegisteredStudent({
        studentId: data.studentId,
        name: name,
      });
    },
    onError: (err) => {
      toast.error(err.message || "Registration failed. Please check details.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phoneNumber || !username || !password || !selectedCourseId) {
      toast.error("Please fill in all required basic fields.");
      return;
    }

    if (postalCode && !/^\d+$/.test(postalCode.trim())) {
      toast.error("Postal code must contain numbers only.");
      return;
    }

    if (!oneOnOneEnabled && !groupSessionEnabled) {
      toast.error("Please select at least one Session Type (One-on-One or Group).");
      return;
    }

    if (!preferredClassTime) {
      toast.error("Please select your Preferred Class Time.");
      return;
    }

    const phone = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
    const parentPhone = parentPhoneNumber
      ? `${parentCountryCode}${parentPhoneNumber}`.replace(/\s+/g, "")
      : undefined;

    const qualObj = activeQualificationsQuery.data?.find(q => String(q.id) === qualificationId);

    registerMutation.mutate({
      name,
      phone,
      email: email || undefined,
      username,
      password,
      courseId: Number(selectedCourseId),
      oneOnOneEnabled,
      groupSessionEnabled,
      preferredClassTime,
      referralCode,
      gender: gender || undefined,
      dob: dob || undefined,
      address: address || undefined,
      postalCode: postalCode ? postalCode.trim() : undefined,
      qualificationId: qualificationId ? Number(qualificationId) : undefined,
      educationalQualification: qualObj ? qualObj.name : (educationalQualification || undefined),
      parentName: parentName || undefined,
      parentPhone,
      paymentOption,
    });
  };

  const referralData = referralInfoQuery.data;
  const isLoading = referralInfoQuery.isLoading;
  const isError = referralInfoQuery.isError;

  const salesExec = referralData?.salesExecutive;
  const courses = referralData?.courses || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="text-sm text-gray-500 font-medium">Loading registration details...</p>
        </div>
      </div>
    );
  }

  if (isError || !referralData || !salesExec) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-red-100 shadow-md">
          <CardHeader className="text-center pb-2">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
              ⚠️
            </div>
            <CardTitle className="text-red-700">Invalid Referral Link</CardTitle>
            <CardDescription>
              This referral link is invalid, expired, or deactivated. Please check with your coordinator or sales executive for a valid link.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 flex justify-center">
            <Button onClick={() => router.push("/login")} className="bg-emerald-600 hover:bg-emerald-700">
              Go to Login Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success view
  if (registeredStudent) {
    return (
      <div className="min-h-screen bg-gradient-to-tr from-emerald-50 via-white to-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-emerald-100 shadow-lg rounded-2xl overflow-hidden">
          <div className="bg-emerald-600 p-6 text-white text-center">
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
              <UserCheck className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold">Welcome to EMTEES!</h2>
            <p className="text-emerald-100 text-xs mt-1">Registration Complete</p>
          </div>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-4 text-center">
              <p className="text-sm text-gray-600">
                Congratulations <strong className="text-gray-900">{registeredStudent.name}</strong>! You have successfully registered.
              </p>
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block">Your Student ID</span>
                <span className="text-2xl font-extrabold text-emerald-800 tracking-wide font-mono block mt-1">
                  {registeredStudent.studentId}
                </span>
                <span className="text-xs text-gray-500 block mt-2">
                  Please keep this ID for your records. You will use your username and password to log in.
                </span>
              </div>
            </div>

            <Button
              onClick={() => router.push("/login")}
              className="w-full bg-emerald-600 hover:bg-emerald-700 h-11 text-sm font-semibold rounded-xl"
            >
              Log In to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/20 via-white to-emerald-50/10 flex items-center justify-center p-4 py-12">
      <Card className="max-w-xl w-full border-emerald-100/40 shadow-xl rounded-2xl overflow-hidden bg-white">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 p-6 text-white">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-8 h-8 text-emerald-100" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">EMTEES Academy Admission</h1>
              <p className="text-xs text-emerald-100 mt-0.5">Start your learning journey today</p>
            </div>
          </div>
          <div className="mt-4 bg-white/10 rounded-lg p-3 text-xs flex items-center gap-2 border border-white/10">
            <ShieldCheck className="w-4 h-4 text-emerald-200 shrink-0" />
            <span>
              Referred by: <strong className="text-white">{salesExec.name}</strong> (Sales Executive)
            </span>
          </div>
        </div>

        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-gray-800">Student Enrollment Form</CardTitle>
          <CardDescription className="text-xs">
            Please enter your personal details and select your course/batch to register.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Academic details */}
            <div className="space-y-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
              <div className="space-y-1.5">
                <Label htmlFor="course" className="text-xs font-semibold text-gray-600">Select Course <span className="text-red-500">*</span></Label>
                <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                  <SelectTrigger id="course" className="bg-white rounded-lg border-gray-200 text-xs">
                    <SelectValue placeholder="Select Course" />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id.toString()}>{course.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Session Type Checkboxes */}
              <div className="space-y-2 border-t pt-3">
                <Label className="text-xs font-semibold text-gray-700">Session Type <span className="text-red-500">*</span> (Select one or both)</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <label className="flex items-center gap-3 p-3 rounded-lg border bg-white cursor-pointer hover:bg-emerald-50/20 transition-colors">
                    <Checkbox
                      checked={oneOnOneEnabled}
                      onCheckedChange={(checked) => setOneOnOneEnabled(!!checked)}
                    />
                    <div>
                      <span className="text-xs font-semibold text-gray-800 block">One-on-One Session</span>
                      <span className="text-[10px] text-gray-500 block">Personalized 1-to-1 mentoring</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg border bg-white cursor-pointer hover:bg-emerald-50/20 transition-colors">
                    <Checkbox
                      checked={groupSessionEnabled}
                      onCheckedChange={(checked) => setGroupSessionEnabled(!!checked)}
                    />
                    <div>
                      <span className="text-xs font-semibold text-gray-800 block">Group Session</span>
                      <span className="text-[10px] text-gray-500 block">Collaborative group learning</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Preferred Class Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="preferredTime" className="text-xs font-semibold text-gray-600">Preferred Class Time <span className="text-red-500">*</span></Label>
                  <Select value={preferredClassTime} onValueChange={setPreferredClassTime}>
                    <SelectTrigger id="preferredTime" className="bg-white rounded-lg border-gray-200 text-xs">
                      <SelectValue placeholder="Select Preferred Timing" />
                    </SelectTrigger>
                    <SelectContent className="text-xs">
                      {PREFERRED_TIME_SLOTS.map((slot) => (
                        <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Payment Type */}
                <div className="space-y-1.5">
                  <Label htmlFor="paymentOption" className="text-xs font-semibold text-gray-600">Payment Type <span className="text-red-500">*</span></Label>
                  <Select value={paymentOption} onValueChange={(val: any) => setPaymentOption(val)}>
                    <SelectTrigger id="paymentOption" className="bg-white rounded-lg border-gray-200 text-xs">
                      <SelectValue placeholder="Select Payment Type" />
                    </SelectTrigger>
                    <SelectContent className="text-xs">
                      <SelectItem value="full_payment">Full Payment</SelectItem>
                      <SelectItem value="installment">Installment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Personal Information */}
            <div className="space-y-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
              <h3 className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Personal Information</h3>
              
              {/* 1. Name */}
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold text-gray-600">Full Name <span className="text-red-500">*</span></Label>
                <Input
                  id="name"
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg text-xs bg-white h-9"
                  required
                />
              </div>

              {/* 2. Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-gray-600">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="e.g. john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-lg text-xs bg-white h-9"
                />
              </div>

              {/* 3. Phone */}
              <PhoneNumberInput
                id="phone"
                label="Phone Number"
                required
                countryCode={countryCode}
                countryISO={countryISO}
                value={phoneNumber}
                placeholder="Phone number"
                onChange={(data) => {
                  setCountryCode(data.countryCode);
                  setCountryISO(data.countryISO);
                  setPhoneNumber(data.phoneNumber);
                }}
              />

              {/* 4. Address */}
              <div className="space-y-1.5">
                <Label htmlFor="address" className="text-xs font-semibold text-gray-600">Address</Label>
                <Textarea
                  id="address"
                  placeholder="Enter full postal address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="rounded-lg text-xs bg-white min-h-[70px]"
                />
              </div>

              {/* 5. Postal Code & 6. Qualification */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="postalCode" className="text-xs font-semibold text-gray-600">Postal Code</Label>
                  <Input
                    id="postalCode"
                    placeholder="e.g. 682001"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="rounded-lg text-xs bg-white h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="qualification" className="text-xs font-semibold text-gray-600">Qualification</Label>
                  <Select value={qualificationId} onValueChange={setQualificationId}>
                    <SelectTrigger id="qualification" className="bg-white rounded-lg border-gray-200 text-xs h-9">
                      <SelectValue placeholder="Select Qualification" />
                    </SelectTrigger>
                    <SelectContent className="text-xs">
                      {activeQualificationsQuery.data?.map((q) => (
                        <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 7. Other existing details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3 mt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="gender" className="text-xs font-semibold text-gray-600">Gender</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger id="gender" className="bg-white rounded-lg border-gray-200 text-xs h-9">
                      <SelectValue placeholder="Select Gender" />
                    </SelectTrigger>
                    <SelectContent className="text-xs">
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dob" className="text-xs font-semibold text-gray-600">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="rounded-lg text-xs bg-white h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="parentName" className="text-xs font-semibold text-gray-600">Parent/Guardian Name</Label>
                  <Input
                    id="parentName"
                    placeholder="e.g. Jane Doe"
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className="rounded-lg text-xs bg-white h-9"
                  />
                </div>

                <PhoneNumberInput
                  id="parentPhone"
                  label="Parent Phone Number"
                  countryCode={parentCountryCode}
                  countryISO={parentCountryISO}
                  value={parentPhoneNumber}
                  placeholder="Parent Phone"
                  onChange={(data) => {
                    setParentCountryCode(data.countryCode);
                    setParentCountryISO(data.countryISO);
                    setParentPhoneNumber(data.phoneNumber);
                  }}
                />
              </div>
            </div>

            {/* Login Credentials */}
            <div className="bg-emerald-50/20 p-4 rounded-xl border border-emerald-100/40 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs font-semibold text-emerald-800">LMS Username <span className="text-red-500">*</span></Label>
                <Input
                  id="username"
                  placeholder="Choose username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-white rounded-lg text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold text-emerald-800">LMS Password <span className="text-red-500">*</span></Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Choose password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white rounded-lg text-xs"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11 font-semibold rounded-xl mt-2"
            >
              {registerMutation.isPending ? "Registering..." : "Complete Registration"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
