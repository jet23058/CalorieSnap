import CalorieLogger from '@/components/calorie-logger';

export default function Home() {
  return (
    <main className="container mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6 text-center text-primary">
        CalorieSnap
      </h1>
      <p className="text-center text-muted-foreground mb-8">
        Take a picture of your food to estimate its calorie count and log your meals.
      </p>
      <CalorieLogger />
    </main>
  );
}
