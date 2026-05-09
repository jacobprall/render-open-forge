export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-text-primary">Settings</h1>
      {children}
    </div>
  );
}
