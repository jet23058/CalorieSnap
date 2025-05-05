import CalorieLogger from '@/components/calorie-logger';

export default function Home() {
  return (
    // Remove container/padding, make main full height
    <main className="h-full">
      {/* Remove title and description, CalorieLogger now manages the whole screen */}
      <CalorieLogger />
    </main>
  );
}
