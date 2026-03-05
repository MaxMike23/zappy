import client from "./client";

export const workOrdersApi = {
  list:       (params)       => client.get("/work-orders/", { params }),
  get:        (id)           => client.get(`/work-orders/${id}`),
  create:     (data)         => client.post("/work-orders/", data),
  update:     (id, d)        => client.put(`/work-orders/${id}`, d),
  archive:    (id)           => client.delete(`/work-orders/${id}`),
  listNotes:  (woId)         => client.get(`/work-orders/${woId}/notes`),
  addNote:    (woId, data)   => client.post(`/work-orders/${woId}/notes`, data),
  deleteNote: (woId, noteId) => client.delete(`/work-orders/${woId}/notes/${noteId}`),
};
