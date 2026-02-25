import { useState, useEffect, useCallback } from 'react'
import type { Project } from '../types'

export interface UseProjectsReturn {
  projects: Project[]
  currentProject: Project | null
  loading: boolean
  createProject: (name: string) => Promise<Project | null>
  selectProject: (project: Project) => void
  deleteProject: (id: string) => Promise<void>
}

function getStoredProjectId(): string | null {
  return localStorage.getItem('currentProjectId')
}

function setStoredProjectId(id: string) {
  localStorage.setItem('currentProjectId', id)
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([])
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      const list: Project[] = data.projects || []
      setProjects(list)

      // Restore last selected project or pick first
      const storedId = getStoredProjectId()
      const restored = list.find((p) => p.id === storedId)
      if (restored) {
        setCurrentProject(restored)
      } else if (list.length > 0) {
        setCurrentProject(list[0])
        setStoredProjectId(list[0].id)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const createProject = useCallback(async (name: string): Promise<Project | null> => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const project: Project = await res.json()
      setProjects((prev) => [project, ...prev])
      setCurrentProject(project)
      setStoredProjectId(project.id)
      return project
    } catch {
      return null
    }
  }, [])

  const selectProject = useCallback((project: Project) => {
    setCurrentProject(project)
    setStoredProjectId(project.id)
  }, [])

  const deleteProject = useCallback(async (id: string) => {
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      setProjects((prev) => prev.filter((p) => p.id !== id))
      if (currentProject?.id === id) {
        setCurrentProject(null)
      }
    } catch {
      // ignore
    }
  }, [currentProject])

  return {
    projects,
    currentProject,
    loading,
    createProject,
    selectProject,
    deleteProject,
  }
}
