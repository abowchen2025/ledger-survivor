/** Phase 0 骨架：每頁只顯示頁名。 */
export function PageTitle({ children }: { children: string }) {
  return <h2 className="text-2xl font-bold">{children}</h2>;
}
