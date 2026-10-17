// Admin: attendance report. The filtering, paging and CSV export live in
// report.js; this file only says which endpoint and elements to use.
// Needs: common.js and report.js loaded first.
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("attendanceContainer")) {
    return;
  }

  const { api, showPanel, getClasses } = NIIT;

  const report = NIIT.createReport({
    path: "/reports/admin/attendance",
    ids: {
      course: "courseFilter",
      class: "classFilter",
      student: "studentFilter",
      instructor: "instructorFilter",
      date: "dateFilter",
      courseList: "courseFilterSuggestions",
      studentList: "studentSuggestions",
      instructorList: "instructorFilterSuggestions",
      apply: "filterAttendanceButton",
      clear: "clearAttendanceFiltersButton",
      export: "exportAttendanceButton",
      tableBody: "attendanceTableBody",
      count: "attendanceCount",
      pager: "attendancePager",
      prev: "attendancePrev",
      next: "attendanceNext",
      pageInfo: "attendancePageInfo",
    },
    loadOptions: async () => {
      const [users, timetables, classResult] = await Promise.all([
        api("/users"),
        api("/timetable"),
        getClasses(),
      ]);

      const list = users.ok ? users.data.users || [] : [];

      return {
        students: list.filter((user) => user.role === "student"),
        instructors: list.filter((user) => user.role === "instructor"),
        courses: [
          ...new Set(
            (timetables.ok ? timetables.data.timetables || [] : []).map(
              (timetable) => timetable.course,
            ),
          ),
        ],
        classes: classResult.classes,
        failed: !users.ok || !timetables.ok || Boolean(classResult.error),
      };
    },
  });

  const openButton = document.getElementById("attendanceReportsButton");

  openButton.addEventListener("click", async () => {
    showPanel("attendanceContainer", openButton);
    await report.open();
  });
});
