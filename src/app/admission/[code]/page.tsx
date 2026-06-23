"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { GraduationCap, ArrowRight, UserCheck, ShieldCheck } from "lucide-react";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";

export default function AdmissionPage() {
  const params = useParams();
  const router = useRouter();
  const referralCode = (params.code as string) || "";

  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [countryISO, setCountryISO] = useState("IN");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [gender, setGender] = useState("");
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
    if (!name || !phoneNumber || !username || !password || !selectedCourseId || !selectedBatchId) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const phone = `${countryCode}${phoneNumber}`.replace(/\s+/g, "");
    const parentPhone = parentPhoneNumber
      ? `${parentCountryCode}${parentPhoneNumber}`.replace(/\s+/g, "")
      : undefined;

    registerMutation.mutate({
      name,
      phone,
      email: email || undefined,
      username,
      password,
      courseId: Number(selectedCourseId),
      batchId: Number(selectedBatchId),
      referralCode,
      gender: gender || undefined,
      dob: dob || undefined,
      educationalQualification: educationalQualification || undefined,
      parentName: parentName || undefined,
      parentPhone,
    });
  };

  const referralData = referralInfoQuery.data;
  const isLoading = referralInfoQuery.isLoading;
  const isError = referralInfoQuery.isError;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify- p-4">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="text-sm text-gray-500 font-medium">Loading registration details...</p>
        </div>
      </div>
    );
  }

  if (isError || !referralData) {
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

  const salesExec = referralData.salesExecutive;
  const courses = referralData.courses;
  const batches = referralData.batches.filter(b => b.moduleId === Number(selectedCourseId));

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
              <div className="space-y-1.5">
                <Label htmlFor="course" className="text-xs font-semibold text-gray-600">Select Course <span className="text-red-500">*</span></Label>
                <Select value={selectedCourseId} onValueChange={(val) => {
                  setSelectedCourseId(val);
                  setSelectedBatchId("");
                }}>
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

              <div className="space-y-1.5">
                <Label htmlFor="batch" className="text-xs font-semibold text-gray-600">Select Batch <span className="text-red-500">*</span></Label>
                <Select value={selectedBatchId} onValueChange={setSelectedBatchId} disabled={!selectedCourseId}>
                  <SelectTrigger id="batch" className="bg-white rounded-lg border-gray-200 text-xs">
                    <SelectValue placeholder={selectedCourseId ? "Select Batch" : "Choose course first"} />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id.toString()}>
                        {batch.name} {batch.timeSlot ? `(${batch.timeSlot})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Profile fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold text-gray-600">Full Name <span className="text-red-500">*</span></Label>
                <Input
                  id="name"
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg text-xs"
                  required
                />
              </div>

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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-gray-600">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="e.g. john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg text-xs"
              />
            </div>

            {/* Additional Student Details */}
            <div className="space-y-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
              <h3 className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Additional Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div className="space-y-1.5">
                <Label htmlFor="qualification" className="text-xs font-semibold text-gray-600">Highest Qualification</Label>
                <Input
                  id="qualification"
                  placeholder="e.g. B.Tech, Graduation, High School"
                  value={educationalQualification}
                  onChange={(e) => setEducationalQualification(e.target.value)}
                  className="rounded-lg text-xs bg-white h-9"
                />
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
