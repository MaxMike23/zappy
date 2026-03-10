import client from "./client";

export const attendanceApi = {
  list:     (params) => client.get("/attendance/",         { params }),
  today:    ()       => client.get("/attendance/today"),
  clockIn:  ()       => client.post("/attendance/clock-in"),
  clockOut: ()       => client.post("/attendance/clock-out"),
};
