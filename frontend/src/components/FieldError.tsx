/** 欄位下方的紅字錯誤（後端 error.fields 或前端檢核文案）。沒有訊息時不佔空間。 */
export function FieldError({ id, message }: { id?: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}
