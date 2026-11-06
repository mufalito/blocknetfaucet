import { Navigate, Route, Routes } from "react-router-dom";
import Admin from "./pages/Admin";
import AdminLogin from "./pages/AdminLogin";
import Dashboard from "./pages/Dashboard";
import Faucet from "./pages/Faucet";
import Perks from "./pages/Perks";
import Signin from "./pages/Signin";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Faucet />} />
      <Route path="/signin" element={<Signin />} />
      <Route path="/perks" element={<Perks />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
