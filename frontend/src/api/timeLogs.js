import client from "./client";

export const timeLogsApi = {
  list:    (params)   => client.get("/time-logs/",      { params }),
  get:     (id)       => client.get(`/time-logs/${id}`),
  create:  (data)     => client.post("/time-logs/",     data),
  update:  (id, data) => client.put(`/time-logs/${id}`, data),
  delete:  (id)       => client.delete(`/time-logs/${id}`),
  summary: (params)   => client.get("/time-logs/summary", { params }),
};
