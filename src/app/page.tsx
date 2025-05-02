import CalorieLogger from '@/components/calorie-logger';

export default function Home() {
  return (
    <main className="container mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6 text-center text-primary">
        卡路里快照
      </h1>
      <p className="text-center text-muted-foreground mb-8">
        拍下您的食物照片，以估算其卡路里數並記錄您的餐點。
      </p>
      <CalorieLogger />
    </main>
  );
}
