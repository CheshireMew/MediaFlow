interface LoadingScreenProps {
  embedded?: boolean;
  title?: string;
  message?: string;
}

export function LoadingScreen({
  embedded = false,
  title = "Connecting to MediaFlow Core...",
  message = "Waiting for backend services to become available.",
}: LoadingScreenProps) {
  return (
    <div
      style={{
        height: embedded ? "100%" : "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1b1e",
        color: "#e0e0e0",
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h2 style={{ marginBottom: "0.75rem" }}>{title}</h2>
      <p style={{ marginBottom: "1rem", color: "#9ca3af", maxWidth: "28rem" }}>
        {message}
      </p>
      <div
        className="loader"
        style={{
          width: "20px",
          height: "20px",
          border: "2px solid #333",
          borderTopColor: "#fff",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      ></div>
      <style>{`
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `}</style>
    </div>
  );
}
