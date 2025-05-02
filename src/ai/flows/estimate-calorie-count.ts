'use server';
/**
 * @fileOverview 卡路里估計 AI 代理。
 *
 * - estimateCalorieCount - 處理卡路里估計流程的函數。
 * - EstimateCalorieCountInput - estimateCalorieCount 函數的輸入類型。
 * - EstimateCalorieCountOutput - estimateCalorieCount 函數的返回類型。
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const EstimateCalorieCountInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "食物品項的照片，格式為 data URI，必須包含 MIME 類型並使用 Base64 編碼。預期格式：'data:<mimetype>;base64,<encoded_data>'。"
    ),
});
export type EstimateCalorieCountInput = z.infer<typeof EstimateCalorieCountInputSchema>;

const EstimateCalorieCountOutputSchema = z.object({
  isFoodItem: z.boolean().describe('影像中是否包含可辨識的食物品項。'), // Added isFoodItem
  foodItem: z.string().describe('影像中辨識出的食物品項 (如果 isFoodItem 為 false，此項可能為空或代表非食物品項)。'),
  calorieEstimate: z.number().describe('食物品項的估計卡路里數 (如果 isFoodItem 為 false，此項可能為 0 或不準確)。'),
  confidence: z.number().describe('卡路里估計的信賴度（0-1）。'),
});
export type EstimateCalorieCountOutput = z.infer<typeof EstimateCalorieCountOutputSchema>;

export async function estimateCalorieCount(
  input: EstimateCalorieCountInput
): Promise<EstimateCalorieCountOutput> {
  return estimateCalorieCountFlow(input);
}

const prompt = ai.definePrompt({
  name: 'estimateCalorieCountPrompt',
  input: {
    schema: z.object({
      photoDataUri: z
        .string()
        .describe(
          "食物品項的照片，格式為 data URI，必須包含 MIME 類型並使用 Base64 編碼。預期格式：'data:<mimetype>;base64,<encoded_data>'。"
        ),
    }),
  },
  output: {
    // Using the updated schema for output definition
    schema: EstimateCalorieCountOutputSchema,
  },
  prompt: `你是營養專家。你的任務是：
1. 判斷提供的影像中是否包含可辨識的食物品項。將判斷結果設定到 'isFoodItem' 欄位 (true 或 false)。
2. 如果影像是食物品項 (isFoodItem 為 true)，請辨識該食物品項，估計其卡路里數，並提供估計的信賴度。
3. 如果影像不是食物品項 (isFoodItem 為 false)，請在 'foodItem' 欄位簡短說明影像內容 (例如：「一隻貓」、「一本書」)，並將 'calorieEstimate' 設為 0，信賴度設為 0。

分析以下影像，並根據上述指示提供結果。

影像： {{media url=photoDataUri}}
`,
});

const estimateCalorieCountFlow = ai.defineFlow<
  typeof EstimateCalorieCountInputSchema,
  typeof EstimateCalorieCountOutputSchema
>({
  name: 'estimateCalorieCountFlow',
  inputSchema: EstimateCalorieCountInputSchema,
  outputSchema: EstimateCalorieCountOutputSchema, // Ensure flow uses the updated schema
},
async input => {
  const {output} = await prompt(input);
  // If the output is somehow null/undefined (shouldn't happen with schema), provide a default 'not food' response
  return output || {
      isFoodItem: false,
      foodItem: "無法分析影像",
      calorieEstimate: 0,
      confidence: 0,
  };
});
