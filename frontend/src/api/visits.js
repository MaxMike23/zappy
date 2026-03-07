import client from "./client";

export const visitsApi = {
  list:     (params)   => client.get("/visits/",              { params }),
  get:      (id)       => client.get(`/visits/${id}`),
  create:   (data)     => client.post("/visits/", data),
  update:   (id, data) => client.put(`/visits/${id}`, data),
  cancel:   (id)       => client.delete(`/visits/${id}`),
  clockIn:  (id)       => client.post(`/visits/${id}/clock-in`),
  clockOut: (id)       => client.post(`/visits/${id}/clock-out`),
};
