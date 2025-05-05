
import CalorieLogger from '@/components/calorie-logger';

export default function Home() {
  return (
    // Use flex layout to allow CalorieLogger to manage height
    <main className="flex flex-col h-full">
      <CalorieLogger />
    </main>
  );
}
