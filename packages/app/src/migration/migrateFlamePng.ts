import chokidar from 'chokidar'
import { promises as fs } from 'fs'
import path from 'path'
import * as v from 'valibot'
import {
  generateTransformId,
  generateVariationId,
} from '@/flame/transformFunction'
import {
  TransformFunctionSchema,
} from '@/flame/valibot/flameSchema'
import { TransformVariationSchema } from '@/flame/valibot/variationSchema'
import {
  extractFlameFromPng,
  insertFlameMetadataToPng,
} from '@/utils/flameInPng'
import { compressJsonQueryParam } from '@/utils/jsonQueryParam'
import type { DrawMode } from '@/flame/drawMode'
import type {
  FlameDescriptorSchema} from '@/flame/valibot/flameSchema';

const latestValibotVersion = '1.0'
const flameDescriptorVersionDefault = latestValibotVersion
export const backgroundColorDefault: [number, number, number] = [0, 0, 0]
export const backgroundColorDefaultWhite: [number, number, number] = [1, 1, 1]
const cameraDefault: { zoom: number; position: [number, number] } = {
  zoom: 1,
  position: [0, 0],
}
const renderSettingsDefult = {
  exposure: 0.25,
  skipIters: 20,
  drawMode: 'light' as DrawMode,
  backgroundColor: backgroundColorDefault,
  camera: cameraDefault,
}
const metadataDefault = {
  version: flameDescriptorVersionDefault,
  author: 'unknown',
}

// v1 array transforms scheme
const FlameVariationsSchema = v.array(TransformVariationSchema)
const FlameTransformsSchema = v.array(
  v.object({
    ...TransformFunctionSchema.entries,
    variations: FlameVariationsSchema,
  }),
)

// Function to transform old metadata to new format
function transformMetadata(
  flameTransforms: v.InferOutput<typeof FlameTransformsSchema>,
): v.InferOutput<typeof FlameDescriptorSchema> {
  return {
    metadata: metadataDefault,
    renderSettings: renderSettingsDefult,
    transforms: Object.fromEntries(
      flameTransforms.map((transform) => [
        generateTransformId(),
        {
          ...transform,
          variations: Object.fromEntries(
            transform.variations.map((variation) => [
              generateVariationId(),
              variation,
            ]),
          ),
        },
      ]),
    ),
  }
}

async function processPngFile(filePath: string): Promise<void> {
  try {
    console.info(`Processing file: ${filePath}`)

    // Read the PNG file
    const buffer = await fs.readFile(filePath)
    const rawJsonData: unknown = await extractFlameFromPng(buffer)

    const parseResult = v.safeParse(FlameTransformsSchema, rawJsonData)
    if (!parseResult.success) {
      console.error(`Validation failed for ${filePath}:`, parseResult.issues)
      return
    }
    // Transform to new format
    const migratedData = transformMetadata(parseResult.output)
    // Validate new metadata
    const newFlameDescriptor = v.safeParse(
      TransformFunctionSchema,
      migratedData,
    )
    if (!newFlameDescriptor.success) {
      console.error(
        `New flame description validation failed for ${filePath}:`,
        newFlameDescriptor.issues,
      )
      return
    }

    // Write back to the file
    const encodedFlames = await compressJsonQueryParam(newFlameDescriptor)
    const newBuffer = insertFlameMetadataToPng(encodedFlames, buffer)
    await fs.writeFile(filePath, newBuffer)
    console.info(`Successfully updated metadata for ${filePath}`)
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error)
  }
}

// Main function to set up the file watcher
async function startMetadataMigration(directory: string): Promise<void> {
  // Verify directory exists
  try {
    await fs.access(directory)
  } catch {
    console.error(`Directory ${directory} does not exist`)
    process.exit(1)
  }

  console.info(`Watching directory: ${directory}`)

  // Set up chokidar watcher
  const watcher = chokidar.watch(path.join(directory, '**/*.png'), {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: true,
  })

  watcher
    .on('add', (filePath) => processPngFile(filePath))
    .on('change', (filePath) => processPngFile(filePath))
    .on('error', (error) => { console.error('Watcher error:', error); })

  // Handle process termination
  process.on('SIGINT', async () => {
    console.info('Stopping watcher...')
    await watcher.close().then(() => {
      console.info('Watcher stopped')
      process.exit(0)
    })
  })
}

// Run the script
const directory = process.argv[2] ?? './images'
// if (!directory) {
//   console.error('Please provide a directory path as an argument')
//   process.exit(1)
// }

void startMetadataMigration(directory)
