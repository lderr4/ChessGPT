import { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { gamesAPI } from "../lib/api";
import { Download, Loader2 } from "lucide-react";

const Profile = () => {
  const { user, updateProfile } = useAuthStore();
  const [chessComUsername, setChessComUsername] = useState("");
  const [lichessUsername, setLichessUsername] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingLichess, setIsImportingLichess] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (user?.chess_com_username) {
      setChessComUsername(user.chess_com_username);
    }
    if (user?.lichess_username) {
      setLichessUsername(user.lichess_username);
    }
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setMessage(null);

    try {
      await updateProfile({
        chess_com_username: chessComUsername.trim(),
        lichess_username: lichessUsername.trim(),
      });
      setMessage({ type: "success", text: "Profile updated successfully!" });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to update profile" });
    } finally {
      setIsUpdating(false);
    }
  };

  const [importAll, setImportAll] = useState(true);
  const [fromYear, setFromYear] = useState<number>(new Date().getFullYear());
  const [fromMonth, setFromMonth] = useState<number>(1);
  const [toYear, setToYear] = useState<number>(new Date().getFullYear());
  const [toMonth, setToMonth] = useState<number>(new Date().getMonth() + 1);
  const [importJobId, setImportJobId] = useState<number | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<string>("");
  const [lichessImportJobId, setLichessImportJobId] = useState<number | null>(
    null
  );
  const [lichessImportProgress, setLichessImportProgress] = useState(0);
  const [lichessImportStatus, setLichessImportStatus] = useState<string>("");

  // Poll for Chess.com import status
  useEffect(() => {
    if (!importJobId) return;

    const pollStatus = async () => {
      try {
        const response = await gamesAPI.getImportStatus(importJobId);
        const { status, progress, imported_games, total_games, error_message } =
          response.data;

        setImportProgress(progress);
        setImportStatus(status);

        if (status === "completed") {
          setMessage({
            type: "success",
            text: `Chess.com import completed! ${imported_games} new games imported.`,
          });
          setImportJobId(null);
          setIsImporting(false);
        } else if (status === "failed") {
          setMessage({
            type: "error",
            text: error_message || "Chess.com import failed. Please try again.",
          });
          setImportJobId(null);
          setIsImporting(false);
        }
      } catch (error) {
        console.error("Error polling import status:", error);
      }
    };

    const interval = setInterval(pollStatus, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [importJobId]);

  // Poll for Lichess import status
  useEffect(() => {
    if (!lichessImportJobId) return;

    const pollStatus = async () => {
      try {
        const response = await gamesAPI.getImportStatus(lichessImportJobId);
        const { status, progress, imported_games, total_games, error_message } =
          response.data;

        setLichessImportProgress(progress);
        setLichessImportStatus(status);

        if (status === "completed") {
          setMessage({
            type: "success",
            text: `Lichess import completed! ${imported_games} new games imported.`,
          });
          setLichessImportJobId(null);
          setIsImportingLichess(false);
        } else if (status === "failed") {
          setMessage({
            type: "error",
            text: error_message || "Lichess import failed. Please try again.",
          });
          setLichessImportJobId(null);
          setIsImportingLichess(false);
        }
      } catch (error) {
        console.error("Error polling Lichess import status:", error);
      }
    };

    const interval = setInterval(pollStatus, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [lichessImportJobId]);

  const handleImportGames = async () => {
    const trimmedUsername = chessComUsername.trim();

    if (!trimmedUsername) {
      setMessage({
        type: "error",
        text: "Please set your Chess.com username first",
      });
      return;
    }

    setIsImporting(true);
    setMessage(null);
    setImportProgress(0);

    try {
      const importData: any = {
        chess_com_username: trimmedUsername,
        import_all: importAll,
      };

      if (!importAll) {
        importData.from_year = fromYear;
        importData.from_month = fromMonth;
        importData.to_year = toYear;
        importData.to_month = toMonth;
      }

      const response = await gamesAPI.importGames(importData);
      setImportJobId(response.data.job_id);

      const dateRange = importAll
        ? "all games"
        : `games from ${fromYear}/${fromMonth} to ${toYear}/${toMonth}`;
      setMessage({
        type: "success",
        text: `Importing Chess.com ${dateRange}...`,
      });
    } catch (error: any) {
      setMessage({
        type: "error",
        text:
          error.response?.data?.detail ||
          "Failed to start Chess.com game import",
      });
      setIsImporting(false);
    }
  };

  const handleImportLichessGames = async () => {
    const trimmedUsername = lichessUsername.trim();

    if (!trimmedUsername) {
      setMessage({
        type: "error",
        text: "Please set your Lichess username first",
      });
      return;
    }

    setIsImportingLichess(true);
    setMessage(null);
    setLichessImportProgress(0);

    try {
      const importData: any = {
        lichess_username: trimmedUsername,
        import_all: importAll,
      };

      if (!importAll) {
        importData.from_year = fromYear;
        importData.from_month = fromMonth;
        importData.to_year = toYear;
        importData.to_month = toMonth;
      }

      const response = await gamesAPI.importLichessGames(importData);
      setLichessImportJobId(response.data.job_id);

      const dateRange = importAll
        ? "all games"
        : `games from ${fromYear}/${fromMonth} to ${toYear}/${toMonth}`;
      setMessage({
        type: "success",
        text: `Importing Lichess ${dateRange}...`,
      });
    } catch (error: any) {
      setMessage({
        type: "error",
        text:
          error.response?.data?.detail || "Failed to start Lichess game import",
      });
      setIsImportingLichess(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Profile Settings
      </h1>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* User Information */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Account Information
        </h2>
        <div className="space-y-3">
          <div>
            <span className="text-sm text-gray-600">Username:</span>
            <p className="text-gray-900 font-medium">{user?.username}</p>
          </div>
          <div>
            <span className="text-sm text-gray-600">Email:</span>
            <p className="text-gray-900 font-medium">{user?.email}</p>
          </div>
          <div>
            <span className="text-sm text-gray-600">Member since:</span>
            <p className="text-gray-900 font-medium">
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString()
                : "-"}
            </p>
          </div>
        </div>
      </div>

      {/* Chess.com Integration */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Chess.com Integration
        </h2>
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label
              htmlFor="chessComUsername"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Chess.com Username
            </label>
            <input
              id="chessComUsername"
              type="text"
              value={chessComUsername}
              onChange={(e) => setChessComUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Your Chess.com username"
            />
          </div>

          <div>
            <label
              htmlFor="lichessUsername"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Lichess.org Username
            </label>
            <input
              id="lichessUsername"
              type="text"
              value={lichessUsername}
              onChange={(e) => setLichessUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Your Lichess.org username"
            />
          </div>

          <button
            type="submit"
            disabled={isUpdating}
            className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50"
          >
            {isUpdating ? "Updating..." : "Update Usernames"}
          </button>
        </form>
      </div>

      {/* Import Games */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Import Games
        </h2>
        <p className="text-gray-600 mb-4">
          Import your games from Chess.com. You can import all games or select a
          specific date range.
        </p>
        {user?.last_import_at && (
          <p className="text-sm text-gray-500 mb-4">
            Last imported: {new Date(user.last_import_at).toLocaleString()}
          </p>
        )}

        {/* Import Options */}
        <div className="mb-6 space-y-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={importAll}
                onChange={() => setImportAll(true)}
                className="w-4 h-4 text-primary-600"
              />
              <span className="text-gray-900 font-medium">
                Import all games
              </span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={!importAll}
                onChange={() => setImportAll(false)}
                className="w-4 h-4 text-primary-600"
              />
              <span className="text-gray-900 font-medium">
                Import specific date range
              </span>
            </label>
          </div>

          {/* Date Range Selection */}
          {!importAll && (
            <div className="ml-6 p-4 bg-gray-50 rounded-lg space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    From Year
                  </label>
                  <input
                    type="number"
                    value={fromYear}
                    onChange={(e) => setFromYear(parseInt(e.target.value))}
                    min="2000"
                    max={new Date().getFullYear()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    From Month
                  </label>
                  <select
                    value={fromMonth}
                    onChange={(e) => setFromMonth(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(
                      (month) => (
                        <option key={month} value={month}>
                          {new Date(2000, month - 1).toLocaleString("default", {
                            month: "long",
                          })}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    To Year
                  </label>
                  <input
                    type="number"
                    value={toYear}
                    onChange={(e) => setToYear(parseInt(e.target.value))}
                    min="2000"
                    max={new Date().getFullYear()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    To Month
                  </label>
                  <select
                    value={toMonth}
                    onChange={(e) => setToMonth(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(
                      (month) => (
                        <option key={month} value={month}>
                          {new Date(2000, month - 1).toLocaleString("default", {
                            month: "long",
                          })}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleImportGames}
          disabled={isImporting || !chessComUsername}
          className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isImporting ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span>Importing...</span>
            </>
          ) : (
            <>
              <Download size={20} />
              <span>Import Games from Chess.com</span>
            </>
          )}
        </button>

        {/* Progress Bar */}
        {isImporting && importProgress > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                {importStatus === "processing"
                  ? "Importing games..."
                  : "Starting import..."}
              </span>
              <span className="text-sm font-medium text-gray-900">
                {importProgress}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-green-600 h-full transition-all duration-500 ease-out rounded-full"
                style={{ width: `${importProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Lichess Import Games */}
      <div className="bg-white rounded-xl shadow-sm p-6 mt-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Import Games from Lichess.org
        </h2>
        <p className="text-gray-600 mb-4">
          Import your games from Lichess.org. You can import all games or select
          a specific date range.
        </p>

        <button
          onClick={handleImportLichessGames}
          disabled={isImportingLichess || !lichessUsername}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isImportingLichess ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span>Importing...</span>
            </>
          ) : (
            <>
              <Download size={20} />
              <span>Import Games from Lichess.org</span>
            </>
          )}
        </button>

        {/* Progress Bar */}
        {isImportingLichess && lichessImportProgress > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                {lichessImportStatus === "processing"
                  ? "Importing games..."
                  : "Starting import..."}
              </span>
              <span className="text-sm font-medium text-gray-900">
                {lichessImportProgress}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-500 ease-out rounded-full"
                style={{ width: `${lichessImportProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
