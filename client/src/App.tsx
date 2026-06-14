import { Route, Routes } from "react-router-dom";
import { Landing } from "./routes/Landing";
import { NotFound } from "./routes/NotFound";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
