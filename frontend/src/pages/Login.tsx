import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoading, isAuthenticated, error, clearError } =
    useAuthStore();
  const navigate = useNavigate();
  const hasRedirected = useRef(false);
  const previousAuthState = useRef(isAuthenticated);

  // Clear error when component unmounts
  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  // Redirect ONLY when authentication state changes from false to true
  useEffect(() => {
    if (
      isAuthenticated &&
      !previousAuthState.current &&
      !hasRedirected.current
    ) {
      hasRedirected.current = true;
      navigate("/dashboard", { replace: true });
    }
    previousAuthState.current = isAuthenticated;
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await login(username, password);
      // Navigation handled by useEffect when isAuthenticated changes
    } catch (err: any) {
      // Error is now handled in the store
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Chess Analytics
          </h1>
          <p className="text-gray-600">
            Track your progress, improve your game
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div
            className={`bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg transition-all duration-200 ${
              error
                ? "opacity-100 max-h-20"
                : "opacity-0 max-h-0 overflow-hidden border-0 py-0"
            }`}
          >
            {error || "\u00A0"}
          </div>

          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Enter your username"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="mt-6 text-center text-gray-600">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-primary-600 font-medium hover:text-primary-700"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
