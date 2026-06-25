import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { ClassAllocation } from "./ClassAllocationSummary";

interface ClassBalanceAdjustmentProps {
  open: boolean;
  onClose: () => void;
  studentId: number;
  type: "oneToOne" | "group";
  currentAllocation: ClassAllocation;
  onSuccess?: () => void;
}

export function ClassBalanceAdjustment({
  open,
  onClose,
  studentId,
  type,
  currentAllocation,
  onSuccess,
}: ClassBalanceAdjustmentProps) {
  const [duration, setDuration] = useState<30 | 45 | 60>(30);
  const [action, setAction] = useState<"add" | "deduct">("add");
  const [amount, setAmount] = useState<number>(0);

  const updateMutation = trpc.students.updateClassAllocation.useMutation({
    onSuccess: () => {
      toast.success("Class balance adjusted successfully!");
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  useEffect(() => {
    if (open) {
      setDuration(30);
      setAction("add");
      setAmount(0);
    }
  }, [open]);

  if (!currentAllocation) return null;

  const handleApply = () => {
    if (amount <= 0) {
      toast.error("Please enter a valid count greater than 0");
      return;
    }

    const alloc = JSON.parse(JSON.stringify(currentAllocation));
    const target = type === "oneToOne" ? alloc.oneToOne : alloc.group;
    const field = `sessions${duration}` as "sessions30" | "sessions45" | "sessions60";
    const completedField = `completed${duration}` as "completed30" | "completed45" | "completed60";
    const currentVal = target[field] || 0;
    const completedVal = target[completedField] || 0;

    let newVal = currentVal;
    if (action === "add") {
      newVal = currentVal + amount;
    } else {
      newVal = currentVal - amount;
      if (newVal < completedVal) {
        toast.error(`Cannot deduct below completed classes (${completedVal} completed)`);
        return;
      }
    }

    target[field] = newVal;

    updateMutation.mutate({
      studentId,
      allocation: {
        oneToOne: {
          teacherId: alloc.oneToOne.teacherId,
          sessions30: alloc.oneToOne.sessions30,
          sessions45: alloc.oneToOne.sessions45,
          sessions60: alloc.oneToOne.sessions60,
        },
        group: {
          teacherId: alloc.group.teacherId,
          batchId: alloc.group.batchId,
          sessions30: alloc.group.sessions30,
          sessions45: alloc.group.sessions45,
          sessions60: alloc.group.sessions60,
        },
      },
    });
  };

  const title = type === "oneToOne" ? "One-to-One Session Balance" : "Group Session Balance";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Adjust {title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Add extra classes or deduct from the allocated class pool.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="font-semibold text-slate-500">Duration</Label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) as any)}
                className="w-full border rounded-lg p-2 bg-white text-xs outline-none"
              >
                <option value={30}>30 Min</option>
                <option value={45}>45 Min</option>
                <option value={60}>60 Min</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="font-semibold text-slate-500">Action</Label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as any)}
                className="w-full border rounded-lg p-2 bg-white text-xs outline-none"
              >
                <option value="add">Add Classes</option>
                <option value="deduct">Deduct Classes</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="font-semibold text-slate-500">Count</Label>
            <Input
              type="number"
              value={amount === 0 ? "" : amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              placeholder="Enter number of classes"
              className="h-9 text-xs bg-white"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={amount <= 0 || updateMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
            onClick={handleApply}
          >
            {updateMutation.isPending ? "Applying..." : "Apply Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
