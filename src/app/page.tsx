import CalorieLogger from '@/components/calorie-logger';

export default function Home() {
  return (
    <main className="container mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6 text-center text-primary">
        卡路里快照
      </h1>
      <p className="text-center text-muted-foreground mb-8">
        拍下您的食物照片，估算卡路里、記錄餐點、追蹤飲水並管理您的健康資料。
      </p>
      {/* CalorieLogger now contains the Tabs component */}
      <CalorieLogger />
    </main>
  );
}
