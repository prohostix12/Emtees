"use client";

import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GraduationCap, Plus, Edit2, Trash2, ArrowUp, ArrowDown, CheckCircle, XCircle, Search, History, AlertTriangle, Users } from "lucide-react";

export default function QualificationManagement() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingQual, setEditingQual] = useState<{ id: number; name: string; isActive: boolean; displayOrder: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Usage / Safeguard state
  const [usageModalQual, setUsageModalQual] = useState<{ id: number; name: string } | null>(null);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const utils = trpc.useUtils();
  const qualificationsQuery = trpc.qualifications.listAll.useQuery();
  const auditLogsQuery = trpc.qualifications.listAuditLogs.useQuery();
  const usageQuery = trpc.qualifications.getUsage.useQuery(
    { id: usageModalQual?.id || 0 },
    { enabled: !!usageModalQual }
  );

  const createMutation = trpc.qualifications.create.useMutation({
    onSuccess: () => {
      toast.success("Qualification added successfully!");
      setIsCreateOpen(false);
      setName("");
      setDisplayOrder(0);
      setIsActive(true);
      utils.qualifications.listAll.invalidate();
      utils.qualifications.listActive.invalidate();
      utils.qualifications.listAuditLogs.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to add qualification.");
    },
  });

  const updateMutation = trpc.qualifications.update.useMutation({
    onSuccess: () => {
      toast.success("Qualification updated successfully!");
      setIsEditOpen(false);
      setEditingQual(null);
      utils.qualifications.listAll.invalidate();
      utils.qualifications.listActive.invalidate();
      utils.qualifications.listAuditLogs.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update qualification.");
    },
  });

  const toggleMutation = trpc.qualifications.toggleStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated!");
      utils.qualifications.listAll.invalidate();
      utils.qualifications.listActive.invalidate();
      utils.qualifications.listAuditLogs.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update status.");
    },
  });

  const deleteMutation = trpc.qualifications.delete.useMutation({
    onSuccess: () => {
      toast.success("Qualification deleted!");
      setUsageModalQual(null);
      setDeleteErrorMsg(null);
      utils.qualifications.listAll.invalidate();
      utils.qualifications.listActive.invalidate();
      utils.qualifications.listAuditLogs.invalidate();
    },
    onError: (err) => {
      setDeleteErrorMsg(err.message || "Failed to delete qualification.");
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    createMutation.mutate({ name: name.trim(), displayOrder, isActive });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQual || !editingQual.name.trim()) return;
    updateMutation.mutate({
      id: editingQual.id,
      name: editingQual.name.trim(),
      displayOrder: editingQual.displayOrder,
      isActive: editingQual.isActive,
    });
  };

  const handleReorder = (qual: any, direction: "up" | "down") => {
    const list = qualificationsQuery.data || [];
    const currentIndex = list.findIndex((q) => q.id === qual.id);
    if (currentIndex === -1) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const targetQual = list[targetIndex];
    updateMutation.mutate({
      id: qual.id,
      name: qual.name,
      isActive: qual.isActive,
      displayOrder: targetQual.displayOrder,
    });
    updateMutation.mutate({
      id: targetQual.id,
      name: targetQual.name,
      isActive: targetQual.isActive,
      displayOrder: qual.displayOrder,
    });
  };

  const list = (qualificationsQuery.data || []).filter((q) =>
    q.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-emerald-600" /> Qualification Master
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage standard educational qualifications available for student profiles across the LMS.
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium h-9 rounded-lg gap-2">
              <Plus className="w-4 h-4" /> Add Qualification
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Add New Qualification</DialogTitle>
              <DialogDescription className="text-xs">
                Create a new standard qualification option.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="create-name" className="text-xs font-semibold text-gray-700">Qualification Name <span className="text-red-500">*</span></Label>
                <Input
                  id="create-name"
                  placeholder="e.g. Bachelor's Degree"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-xs h-9"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="create-order" className="text-xs font-semibold text-gray-700">Display Order</Label>
                  <Input
                    id="create-order"
                    type="number"
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5 flex flex-col justify-end">
                  <div className="flex items-center justify-between h-9 px-3 rounded-lg border bg-gray-50/50">
                    <Label htmlFor="create-active" className="text-xs font-medium cursor-pointer">Active Status</Label>
                    <Switch id="create-active" checked={isActive} onCheckedChange={setIsActive} />
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOpen(false)} className="text-xs">
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={createMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                  {createMutation.isPending ? "Adding..." : "Add Qualification"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="qualifications" className="w-full">
        <TabsList className="bg-gray-100/80 p-1 rounded-lg">
          <TabsTrigger value="qualifications" className="text-xs font-medium gap-1.5">
            <GraduationCap className="w-3.5 h-3.5" /> Qualifications List
          </TabsTrigger>
          <TabsTrigger value="audit-logs" className="text-xs font-medium gap-1.5">
            <History className="w-3.5 h-3.5" /> Audit Trail Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="qualifications" className="mt-4 space-y-4">
          <Card className="border-gray-200 shadow-sm rounded-xl overflow-hidden">
            <CardHeader className="bg-gray-50/50 pb-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-sm font-semibold text-gray-800">
                Qualifications List ({list.length})
              </CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                <Input
                  placeholder="Search qualifications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-8 bg-white"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {qualificationsQuery.isLoading ? (
                <div className="p-8 text-center text-xs text-gray-500">Loading qualifications...</div>
              ) : list.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  {searchQuery ? "No qualifications matching search criteria." : "No qualifications defined yet. Click Add Qualification to create one."}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/30 text-xs">
                      <TableHead className="w-16">Order</TableHead>
                      <TableHead>Qualification Name</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                      <TableHead className="text-right w-48">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {list.map((qual, idx) => (
                      <TableRow key={qual.id} className="hover:bg-gray-50/50">
                        <TableCell className="font-mono text-gray-500">{qual.displayOrder}</TableCell>
                        <TableCell className="font-medium text-gray-900">{qual.name}</TableCell>
                        <TableCell>
                          {qual.isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                              <CheckCircle className="w-3 h-3" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                              <XCircle className="w-3 h-3" /> Disabled
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={idx === 0}
                              onClick={() => handleReorder(qual, "up")}
                              className="h-7 w-7 p-0 text-gray-500 hover:text-gray-900"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={idx === list.length - 1}
                              onClick={() => handleReorder(qual, "down")}
                              className="h-7 w-7 p-0 text-gray-500 hover:text-gray-900"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </Button>

                            <Switch
                              checked={qual.isActive}
                              onCheckedChange={(checked) => toggleMutation.mutate({ id: qual.id, isActive: checked })}
                              className="mx-1"
                            />

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setUsageModalQual({ id: qual.id, name: qual.name });
                              }}
                              className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              title="Check Usage"
                            >
                              <Users className="w-3.5 h-3.5" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingQual({ id: qual.id, name: qual.name, isActive: qual.isActive, displayOrder: qual.displayOrder });
                                setIsEditOpen(true);
                              }}
                              className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeleteErrorMsg(null);
                                setUsageModalQual({ id: qual.id, name: qual.name });
                              }}
                              className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit-logs" className="mt-4">
          <Card className="border-gray-200 shadow-sm rounded-xl overflow-hidden">
            <CardHeader className="bg-gray-50/50 pb-3 border-b border-gray-100">
              <CardTitle className="text-sm font-semibold text-gray-800">Qualification Modification Audit Logs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {auditLogsQuery.isLoading ? (
                <div className="p-8 text-center text-xs text-gray-500">Loading audit trail...</div>
              ) : !auditLogsQuery.data || auditLogsQuery.data.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">No audit logs recorded yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/30 text-xs">
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Performed By User ID</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {auditLogsQuery.data.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-gray-500 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                            log.action === "ADDED" ? "bg-green-100 text-green-800" :
                            log.action === "UPDATED" ? "bg-blue-100 text-blue-800" :
                            log.action === "DELETED" ? "bg-red-100 text-red-800" :
                            "bg-purple-100 text-purple-800"
                          }`}>
                            {log.action}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-gray-600">{log.performedBy || "System/Admin"}</TableCell>
                        <TableCell className="max-w-xs truncate text-gray-600 font-mono text-[11px]">
                          {log.newValue || log.oldValue || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Qualification</DialogTitle>
            <DialogDescription className="text-xs">
              Modify qualification details.
            </DialogDescription>
          </DialogHeader>
          {editingQual && (
            <form onSubmit={handleUpdate} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs font-semibold text-gray-700">Qualification Name <span className="text-red-500">*</span></Label>
                <Input
                  id="edit-name"
                  value={editingQual.name}
                  onChange={(e) => setEditingQual({ ...editingQual, name: e.target.value })}
                  className="text-xs h-9"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-order" className="text-xs font-semibold text-gray-700">Display Order</Label>
                  <Input
                    id="edit-order"
                    type="number"
                    value={editingQual.displayOrder}
                    onChange={(e) => setEditingQual({ ...editingQual, displayOrder: parseInt(e.target.value, 10) || 0 })}
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5 flex flex-col justify-end">
                  <div className="flex items-center justify-between h-9 px-3 rounded-lg border bg-gray-50/50">
                    <Label htmlFor="edit-active" className="text-xs font-medium cursor-pointer">Active Status</Label>
                    <Switch
                      id="edit-active"
                      checked={editingQual.isActive}
                      onCheckedChange={(checked) => setEditingQual({ ...editingQual, isActive: checked })}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditOpen(false)} className="text-xs">
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={updateMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Usage Inspection & Deletion Safeguard Modal */}
      <Dialog open={!!usageModalQual} onOpenChange={(open) => { if (!open) { setUsageModalQual(null); setDeleteErrorMsg(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-600" /> Usage & Deletion Safeguard
            </DialogTitle>
            <DialogDescription className="text-xs">
              Review active student assignments for <strong>{usageModalQual?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {usageQuery.isLoading ? (
              <div className="text-center py-4 text-xs text-gray-500">Calculating student assignments...</div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-amber-900 font-medium">
                  <span>Assigned Student Records:</span>
                  <span className="text-sm font-bold bg-amber-200/60 px-2 py-0.5 rounded-full">{usageQuery.data?.totalUsage || 0}</span>
                </div>
                {usageQuery.data?.totalUsage ? (
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    This qualification is currently assigned to {usageQuery.data.totalUsage} student(s). To preserve data integrity across LMS reports, hard deletion is blocked. You can disable this qualification instead to hide it from new registrations.
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-700 font-medium">
                    No active student records are using this qualification. It is safe to permanently delete.
                  </p>
                )}
              </div>
            )}

            {deleteErrorMsg && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-xs text-red-700">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{deleteErrorMsg}</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => { setUsageModalQual(null); setDeleteErrorMsg(null); }} className="text-xs">
              Close
            </Button>
            {usageQuery.data?.totalUsage === 0 ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => usageModalQual && deleteMutation.mutate({ id: usageModalQual.id })}
                className="text-xs gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Permanently Delete
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  if (usageModalQual) {
                    toggleMutation.mutate({ id: usageModalQual.id, isActive: false });
                    setUsageModalQual(null);
                  }
                }}
                className="text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
              >
                Disable Qualification
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
