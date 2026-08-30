import assert from 'node:assert/strict'
import test from 'node:test'
import { AppError } from '../../types'
import {
  deleteStageInWorkspacePipeline,
  updateStageInWorkspacePipeline,
} from './pipeline-stage-security'

test('no actualiza una etapa ajena aunque el id exista en otro pipeline', async () => {
  let mutations = 0
  const database = {
    stage: {
      findFirst: async ({ where }: any) => {
        assert.deepEqual(where, {
          id: 'stage-foreign',
          pipelineId: 'pipeline-own',
          pipeline: { workspaceId: 'workspace-own' },
        })
        return null
      },
      updateMany: async () => {
        mutations += 1
        return { count: 1 }
      },
    },
  }

  await assert.rejects(
    updateStageInWorkspacePipeline(
      database,
      'workspace-own',
      'pipeline-own',
      'stage-foreign',
      { name: 'Intrusión' }
    ),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  )
  assert.equal(mutations, 0)
})

test('actualiza con una condición que incluye etapa y pipeline', async () => {
  let reads = 0
  const database = {
    stage: {
      findFirst: async ({ where }: any) => {
        reads += 1
        assert.deepEqual(where, {
          id: 'stage-1',
          pipelineId: 'pipeline-1',
          pipeline: { workspaceId: 'workspace-1' },
        })
        return reads === 1
          ? { id: 'stage-1', pipelineId: 'pipeline-1', name: 'Anterior' }
          : { id: 'stage-1', pipelineId: 'pipeline-1', name: 'Nueva' }
      },
      updateMany: async ({ where, data }: any) => {
        assert.deepEqual(where, { id: 'stage-1', pipelineId: 'pipeline-1' })
        assert.deepEqual(data, { name: 'Nueva' })
        return { count: 1 }
      },
    },
  }

  const stage = await updateStageInWorkspacePipeline(
    database,
    'workspace-1',
    'pipeline-1',
    'stage-1',
    { name: 'Nueva' }
  )
  assert.equal(stage.name, 'Nueva')
})

test('no elimina una etapa que no pertenece al pipeline validado', async () => {
  let deletions = 0
  const database = {
    stage: {
      findFirst: async () => null,
      deleteMany: async () => {
        deletions += 1
        return { count: 1 }
      },
    },
  }

  await assert.rejects(
    deleteStageInWorkspacePipeline(
      database,
      'workspace-own',
      'pipeline-own',
      'stage-foreign'
    ),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  )
  assert.equal(deletions, 0)
})

test('elimina con una condición que incluye etapa y pipeline', async () => {
  const database = {
    stage: {
      findFirst: async ({ where }: any) => {
        assert.deepEqual(where, {
          id: 'stage-1',
          pipelineId: 'pipeline-1',
          pipeline: { workspaceId: 'workspace-1' },
        })
        return { id: 'stage-1' }
      },
      deleteMany: async ({ where }: any) => {
        assert.deepEqual(where, { id: 'stage-1', pipelineId: 'pipeline-1' })
        return { count: 1 }
      },
    },
  }

  await deleteStageInWorkspacePipeline(
    database,
    'workspace-1',
    'pipeline-1',
    'stage-1'
  )
})
