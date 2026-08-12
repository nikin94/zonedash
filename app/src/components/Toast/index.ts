/**
 * The app-wide toast host — mounted once in the header. The toast STATE and the
 * `showToast` / `dismissToast` triggers live in state/toast.ts (callable from
 * anywhere, no hook); this folder is just the view that renders it.
 */
export { ToastHost } from "./ToastHost";
