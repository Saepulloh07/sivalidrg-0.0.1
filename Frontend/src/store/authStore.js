// src/store/authStore.js
import { create } from "zustand";
import { persist } from "zustand/middleware";

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      showWelcomeGuide: true,

      login: (user, token) => {
        set({
          user,
          token,
          isAuthenticated: true,
          showWelcomeGuide: !localStorage.getItem("hasSeenGuide"),
        });
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
        localStorage.removeItem("auth-storage");
      },

      updateUser: (userData) => {
        set((state) => ({
          user: { ...state.user, ...userData },
        }));
      },

      hideWelcomeGuide: () => {
        set({ showWelcomeGuide: false });
        localStorage.setItem("hasSeenGuide", "true");
      },
    }),
    {
      name: "auth-storage",
    }
  )
);

export default useAuthStore;
