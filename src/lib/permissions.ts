export interface RolePermissions {
  dashboard: boolean;
  students: boolean;
  enrollments: boolean;
  courses: boolean;
  profile: boolean;
}

export const ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  super_admin: {
    dashboard: true,
    students: true,
    enrollments: true,
    courses: true,
    profile: true,
  },
  admin: {
    dashboard: true,
    students: true,
    enrollments: true,
    courses: true,
    profile: true,
  },
  academic_head: {
    dashboard: true,
    students: true,
    enrollments: true,
    courses: true,
    profile: true,
  },
  teacher: {
    dashboard: true,
    students: true,
    enrollments: false,
    courses: true,
    profile: true,
  },
  sales_executive: {
    dashboard: true,
    students: true,
    enrollments: true,
    courses: true,
    profile: true,
  },
  student: {
    dashboard: true,
    students: false,
    enrollments: false,
    courses: true,
    profile: true,
  },
};

export function hasPermission(role: string | undefined, permission: keyof RolePermissions): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.[permission] ?? false;
}

