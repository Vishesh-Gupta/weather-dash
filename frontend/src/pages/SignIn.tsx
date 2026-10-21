import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Navigate, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { api } from '../api/client'
import { queryKeys, sessionQuery } from '../api/queries'
import { errorText } from '../lib/errors'

const signInRoute = getRouteApi('/sign-in')

export function SignInPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { redirect } = signInRoute.useSearch()
  const { data: session } = useQuery(sessionQuery())
  const [password, setPassword] = useState('')

  const signIn = useMutation({
    mutationFn: api.signIn,
    onSuccess: async (next) => {
      queryClient.setQueryData(queryKeys.session, next)
      await navigate({ to: redirect ?? '/manage' })
    },
    onSettled: () => setPassword(''),
  })

  if (session?.is_admin) return <Navigate to={redirect ?? '/manage'} replace />

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (password) signIn.mutate(password)
  }

  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <h1>Admin sign-in</h1>
      <p className="subtle on-sky">
        Sign in to track or remove locations and trigger data collection.
      </p>
      <form className="card stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <button
            type="submit"
            className="button button-primary"
            disabled={signIn.isPending || !password}
          >
            {signIn.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
        {signIn.error ? (
          <p className="error" role="alert">
            {errorText(signIn.error)}
          </p>
        ) : null}
      </form>
    </div>
  )
}
