import { useEffect, useRef, useState } from "react";

export default function LectorQr({ onCodigo }) {
  const video = useRef(null);
  const controles = useRef(null);
  const [activo, setActivo] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => controles.current?.stop(), []);

  async function iniciar() {
    setError("");
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const lector = new BrowserQRCodeReader();
      const control = await lector.decodeFromVideoDevice(undefined, video.current, (resultado) => {
        if (!resultado) return;
        controles.current?.stop();
        controles.current = null;
        setActivo(false);
        onCodigo(resultado.getText());
      });
      controles.current = control;
      setActivo(true);
    } catch (err) {
      setActivo(false);
      setError(err.message || "No se pudo acceder a la cámara.");
    }
  }

  function detener() {
    controles.current?.stop();
    controles.current = null;
    setActivo(false);
  }

  return (
    <div className="lector-qr">
      <video ref={video} className={activo ? "scanner-video activo" : "scanner-video"} muted playsInline />
      <div className="filtros">
        {!activo
          ? <button type="button" onClick={iniciar}>Usar cámara para escanear</button>
          : <button type="button" onClick={detener}>Detener cámara</button>}
      </div>
      {error && <p className="err" role="alert">{error}. Comprueba los permisos y abre la aplicación mediante HTTPS.</p>}
    </div>
  );
}
