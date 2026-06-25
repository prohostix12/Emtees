import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings, User, BookOpen, Clock } from "lucide-react";

interface AllocationDetail {
  teacherId: number | null;
  batchId?: number | null;
  sessions30: number;
  sessions45: number;
  sessions60: number;
  completed30: number;
  completed45: number;
  completed60: number;
  remaining30: number;
  remaining45: number;
  remaining60: number;
}

export interface ClassAllocation {
  oneToOne: AllocationDetail;
  group: AllocationDetail;
}

interface ClassAllocationSummaryProps {
  allocation: ClassAllocation;
  oneToOneTeacherName?: string;
  groupTeacherName?: string;
  groupBatchName?: string;
  isAdmin?: boolean;
  onConfigureClick?: () => void;
  onAdjustClick?: (type: "oneToOne" | "group") => void;
  batchName?: string;
  moduleName?: string;
}

export function ClassAllocationSummary({
  allocation,
  oneToOneTeacherName = "Unassigned",
  groupTeacherName = "Unassigned",
  groupBatchName = "Unassigned",
  isAdmin = false,
  onConfigureClick,
  onAdjustClick,
  batchName,
  moduleName,
}: ClassAllocationSummaryProps) {
  const o2oAlloc = allocation?.oneToOne;
  const groupAlloc = allocation?.group;

  const o2oTotalAllocated = (o2oAlloc?.sessions30 || 0) + (o2oAlloc?.sessions45 || 0) + (o2oAlloc?.sessions60 || 0);
  const o2oTotalCompleted = (o2oAlloc?.completed30 || 0) + (o2oAlloc?.completed45 || 0) + (o2oAlloc?.completed60 || 0);
  const o2oTotalRemaining = (o2oAlloc?.remaining30 || 0) + (o2oAlloc?.remaining45 || 0) + (o2oAlloc?.remaining60 || 0);

  const groupTotalAllocated = (groupAlloc?.sessions30 || 0) + (groupAlloc?.sessions45 || 0) + (groupAlloc?.sessions60 || 0);
  const groupTotalCompleted = (groupAlloc?.completed30 || 0) + (groupAlloc?.completed45 || 0) + (groupAlloc?.completed60 || 0);
  const groupTotalRemaining = (groupAlloc?.remaining30 || 0) + (groupAlloc?.remaining45 || 0) + (groupAlloc?.remaining60 || 0);

  const activeBatch = batchName || groupBatchName;

  return (
    <Card className="border-slate-200/80 shadow-sm overflow-hidden rounded-2xl bg-white dark:bg-slate-900">
      <CardHeader className="bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 py-3 px-4 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-emerald-600" />
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Class Allocation & Package Details</CardTitle>
        </div>
        {isAdmin && onConfigureClick && !activeBatch && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl"
            onClick={onConfigureClick}
          >
            Configure Package
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-5">
        {/* Active Enrollment Summary Banner */}
        {(activeBatch || moduleName) && (
          <div className="bg-gradient-to-r from-emerald-50/60 via-teal-50/20 to-slate-50/50 dark:from-emerald-950/20 dark:via-teal-950/10 dark:to-slate-950/20 border border-emerald-100/50 dark:border-emerald-900/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm mb-6 transition-all duration-300 hover:shadow-md">
            <div className="space-y-1">
              <span className="text-[9px] uppercase font-bold tracking-wider text-emerald-700/80 dark:text-emerald-400">Active Enrollment Details</span>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {moduleName && (
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-100/70 dark:bg-emerald-900/40 rounded-xl text-emerald-700 dark:text-emerald-400">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-bold leading-none uppercase tracking-wider">Course/Module</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{moduleName}</span>
                    </div>
                  </div>
                )}
                {activeBatch && (
                  <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800 pt-2 sm:pt-0 sm:pl-6">
                    <div className="p-1.5 bg-teal-100/70 dark:bg-teal-900/40 rounded-xl text-teal-700 dark:text-teal-400">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-bold leading-none uppercase tracking-wider">Assigned Batch</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{activeBatch}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {isAdmin && onConfigureClick && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 px-4 text-xs font-bold border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 shadow-sm transition-all duration-200 rounded-xl self-start sm:self-center"
                onClick={onConfigureClick}
              >
                Configure Package
              </Button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* One-to-One Section */}
          <div className="border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 bg-slate-50/30 dark:bg-slate-900/20 flex flex-col justify-between space-y-4 hover:border-slate-200 dark:hover:border-slate-700/80 transition-all duration-200">
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2 border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">One-to-One Sessions</h4>
                <Badge className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-50 text-[10px] font-bold">
                  1-to-1
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-2.5 bg-white dark:bg-slate-900 shadow-sm">
                  <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Allocated</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-sm">{o2oTotalAllocated}</span>
                </div>
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-2.5 bg-white dark:bg-slate-900 shadow-sm">
                  <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Completed</span>
                  <span className="font-mono font-bold text-slate-500 dark:text-slate-400 text-sm">{o2oTotalCompleted}</span>
                </div>
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-2.5 bg-white dark:bg-slate-900 shadow-sm">
                  <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Remaining</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">{o2oTotalRemaining}</span>
                </div>
              </div>

              {/* Detailed duration breakdown */}
              <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden bg-white/70 dark:bg-slate-900/60 shadow-sm">
                <div className="grid grid-cols-4 bg-slate-50/80 dark:bg-slate-800/40 px-3 py-2 font-bold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 text-[9px] uppercase tracking-wider">
                  <div>Duration</div>
                  <div className="text-center">Allocated</div>
                  <div className="text-center">Used</div>
                  <div className="text-center">Remaining</div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-850">
                  <div className="grid grid-cols-4 px-3 py-2 items-center text-[11px] text-slate-700 dark:text-slate-300">
                    <div className="font-semibold">30 Min</div>
                    <div className="text-center font-mono">{o2oAlloc?.sessions30 ?? 0}</div>
                    <div className="text-center font-mono text-slate-400">{o2oAlloc?.completed30 ?? 0}</div>
                    <div className="text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{o2oAlloc?.remaining30 ?? 0}</div>
                  </div>
                  <div className="grid grid-cols-4 px-3 py-2 items-center text-[11px] text-slate-700 dark:text-slate-300">
                    <div className="font-semibold">45 Min</div>
                    <div className="text-center font-mono">{o2oAlloc?.sessions45 ?? 0}</div>
                    <div className="text-center font-mono text-slate-400">{o2oAlloc?.completed45 ?? 0}</div>
                    <div className="text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{o2oAlloc?.remaining45 ?? 0}</div>
                  </div>
                  <div className="grid grid-cols-4 px-3 py-2 items-center text-[11px] text-slate-700 dark:text-slate-300">
                    <div className="font-semibold">60 Min</div>
                    <div className="text-center font-mono">{o2oAlloc?.sessions60 ?? 0}</div>
                    <div className="text-center font-mono text-slate-400">{o2oAlloc?.completed60 ?? 0}</div>
                    <div className="text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{o2oAlloc?.remaining60 ?? 0}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 border-dashed">
              <div className="flex items-center gap-2 text-xs">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 font-medium">Assigned Teacher:</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{oneToOneTeacherName}</span>
              </div>
              {isAdmin && onAdjustClick && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs font-semibold rounded-xl"
                  onClick={() => onAdjustClick("oneToOne")}
                >
                  Adjust Balance
                </Button>
              )}
            </div>
          </div>

          {/* Group Sessions Section */}
          <div className="border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 bg-slate-50/30 dark:bg-slate-900/20 flex flex-col justify-between space-y-4 hover:border-slate-200 dark:hover:border-slate-700/80 transition-all duration-200">
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2 border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">Group Sessions</h4>
                <Badge className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/50 hover:bg-blue-50 text-[10px] font-bold">
                  Group
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-2.5 bg-white dark:bg-slate-900 shadow-sm">
                  <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Allocated</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-sm">{groupTotalAllocated}</span>
                </div>
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-2.5 bg-white dark:bg-slate-900 shadow-sm">
                  <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Completed</span>
                  <span className="font-mono font-bold text-slate-500 dark:text-slate-400 text-sm">{groupTotalCompleted}</span>
                </div>
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-2.5 bg-white dark:bg-slate-900 shadow-sm">
                  <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Remaining</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">{groupTotalRemaining}</span>
                </div>
              </div>

              {/* Detailed duration breakdown */}
              <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden bg-white/70 dark:bg-slate-900/60 shadow-sm">
                <div className="grid grid-cols-4 bg-slate-50/80 dark:bg-slate-800/40 px-3 py-2 font-bold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 text-[9px] uppercase tracking-wider">
                  <div>Duration</div>
                  <div className="text-center">Allocated</div>
                  <div className="text-center">Used</div>
                  <div className="text-center">Remaining</div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-850">
                  <div className="grid grid-cols-4 px-3 py-2 items-center text-[11px] text-slate-700 dark:text-slate-300">
                    <div className="font-semibold">30 Min</div>
                    <div className="text-center font-mono">{groupAlloc?.sessions30 ?? 0}</div>
                    <div className="text-center font-mono text-slate-400">{groupAlloc?.completed30 ?? 0}</div>
                    <div className="text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{groupAlloc?.remaining30 ?? 0}</div>
                  </div>
                  <div className="grid grid-cols-4 px-3 py-2 items-center text-[11px] text-slate-700 dark:text-slate-300">
                    <div className="font-semibold">45 Min</div>
                    <div className="text-center font-mono">{groupAlloc?.sessions45 ?? 0}</div>
                    <div className="text-center font-mono text-slate-400">{groupAlloc?.completed45 ?? 0}</div>
                    <div className="text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{groupAlloc?.remaining45 ?? 0}</div>
                  </div>
                  <div className="grid grid-cols-4 px-3 py-2 items-center text-[11px] text-slate-700 dark:text-slate-300">
                    <div className="font-semibold">60 Min</div>
                    <div className="text-center font-mono">{groupAlloc?.sessions60 ?? 0}</div>
                    <div className="text-center font-mono text-slate-400">{groupAlloc?.completed60 ?? 0}</div>
                    <div className="text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{groupAlloc?.remaining60 ?? 0}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800 border-dashed">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-400 font-medium">Assigned Teacher:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{groupTeacherName}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-400 font-medium">Assigned Batch:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{groupBatchName}</span>
                </div>
              </div>
              {isAdmin && onAdjustClick && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs font-semibold rounded-xl"
                  onClick={() => onAdjustClick("group")}
                >
                  Adjust Balance
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

