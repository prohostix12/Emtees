import React from "react";
import { trpc } from "@/providers/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ClassAllocationValue {
  oneToOne: {
    teacherId: number | "";
    sessions30: number;
    sessions45: number;
    sessions60: number;
  };
  group: {
    teacherId: number | "";
    batchId: number | "";
    sessions30: number;
    sessions45: number;
    sessions60: number;
  };
}

interface ClassAllocationFormProps {
  value: ClassAllocationValue;
  onChange: (value: ClassAllocationValue) => void;
}

export function ClassAllocationForm({ value, onChange }: ClassAllocationFormProps) {
  const teachersQuery = trpc.user.list.useQuery({ role: "teacher", status: "active", limit: 200 });
  const batchesQuery = trpc.learning.listBatches.useQuery(undefined);

  const handleO2OChange = (field: string, val: any) => {
    onChange({
      ...value,
      oneToOne: {
        ...value.oneToOne,
        [field]: val,
      },
    });
  };

  const handleGroupChange = (field: string, val: any) => {
    onChange({
      ...value,
      group: {
        ...value.group,
        [field]: val,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* One-to-One Allocation Section */}
      <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-4">
        <h4 className="font-bold text-xs text-emerald-800 uppercase tracking-wider">One-to-One Sessions Allocation</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600">Assigned Teacher</Label>
            <select
              value={value.oneToOne.teacherId}
              onChange={(e) => handleO2OChange("teacherId", e.target.value !== "" ? Number(e.target.value) : "")}
              className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-xs outline-none"
            >
              <option value="">Select Teacher</option>
              {teachersQuery.data?.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name} ({t.unionId})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600">30 Min Classes</Label>
            <Input
              type="number"
              value={value.oneToOne.sessions30}
              onChange={(e) => handleO2OChange("sessions30", Math.max(0, Number(e.target.value)))}
              min={0}
              className="h-9 text-xs bg-white"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600">45 Min Classes</Label>
            <Input
              type="number"
              value={value.oneToOne.sessions45}
              onChange={(e) => handleO2OChange("sessions45", Math.max(0, Number(e.target.value)))}
              min={0}
              className="h-9 text-xs bg-white"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600">60 Min Classes</Label>
            <Input
              type="number"
              value={value.oneToOne.sessions60}
              onChange={(e) => handleO2OChange("sessions60", Math.max(0, Number(e.target.value)))}
              min={0}
              className="h-9 text-xs bg-white"
            />
          </div>
        </div>
        <p className="text-[10px] text-right font-semibold text-slate-500">
          Total One-to-One: {value.oneToOne.sessions30 + value.oneToOne.sessions45 + value.oneToOne.sessions60} Sessions
        </p>
      </div>

      {/* Group Allocation Section */}
      <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-4">
        <h4 className="font-bold text-xs text-emerald-800 uppercase tracking-wider">Group Sessions Allocation</h4>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600">Assigned Teacher</Label>
            <select
              value={value.group.teacherId}
              onChange={(e) => handleGroupChange("teacherId", e.target.value !== "" ? Number(e.target.value) : "")}
              className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-xs outline-none"
            >
              <option value="">Select Teacher</option>
              {teachersQuery.data?.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name} ({t.unionId})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600">Assigned Batch</Label>
            <select
              value={value.group.batchId}
              onChange={(e) => handleGroupChange("batchId", e.target.value !== "" ? Number(e.target.value) : "")}
              className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-xs outline-none"
            >
              <option value="">Select Batch</option>
              {batchesQuery.data?.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600">30 Min Classes</Label>
            <Input
              type="number"
              value={value.group.sessions30}
              onChange={(e) => handleGroupChange("sessions30", Math.max(0, Number(e.target.value)))}
              min={0}
              className="h-9 text-xs bg-white"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600">45 Min Classes</Label>
            <Input
              type="number"
              value={value.group.sessions45}
              onChange={(e) => handleGroupChange("sessions45", Math.max(0, Number(e.target.value)))}
              min={0}
              className="h-9 text-xs bg-white"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600">60 Min Classes</Label>
            <Input
              type="number"
              value={value.group.sessions60}
              onChange={(e) => handleGroupChange("sessions60", Math.max(0, Number(e.target.value)))}
              min={0}
              className="h-9 text-xs bg-white"
            />
          </div>
        </div>
        <p className="text-[10px] text-right font-semibold text-slate-500">
          Total Group: {value.group.sessions30 + value.group.sessions45 + value.group.sessions60} Sessions
        </p>
      </div>
    </div>
  );
}
