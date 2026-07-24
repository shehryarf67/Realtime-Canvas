"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

async function responseError(response: Response, fallback: string): Promise<string> {
  // Some server failures may not contain JSON, so forms still need a useful message.
  try {
    const data = await response.json();
    return typeof data.error === "string" ? data.error : fallback;
  } catch {
    return fallback;
  }
}

const inputClass = "mt-2 w-full border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";

export default function AccountPage() {
  const isAuthed = useRequireAuth();
  const auth = useAuth();

  if (!isAuthed || !auth?.user) return null;
  return <AccountSettings user={auth.user} setUser={auth.setUser} />;
}

type AccountUser = { userId: string; name: string; email: string };

function AccountSettings({
  user,
  setUser,
}: {
  user: AccountUser;
  setUser: (user: AccountUser | null) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setProfileStatus("Display name is required.");
      return;
    }

    setSavingProfile(true);
    setProfileStatus(null);
    try {
      const response = await fetch(`${SERVER_URL}/auth/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!response.ok) {
        setProfileStatus(await responseError(response, "Could not update your profile."));
        return;
      }
      const user = await response.json();
      setUser(user);
      setName(user.name);
      setProfileStatus("Display name updated.");
    } catch {
      setProfileStatus("Can't reach the server right now. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  // The server checks the current password again and cancels every older session.
  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setPasswordStatus("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus("New passwords do not match.");
      return;
    }

    setChangingPassword(true);
    setPasswordStatus(null);
    try {
      const response = await fetch(`${SERVER_URL}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        setPasswordStatus(await responseError(response, "Could not change your password."));
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus("Password changed. Your other sessions have been signed out.");
    } catch {
      setPasswordStatus("Can't reach the server right now. Please try again.");
    } finally {
      setChangingPassword(false);
    }
  }

  // Account deletion needs both the password and an exact typed confirmation.
  async function handleDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleteConfirmation !== "DELETE") return;

    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`${SERVER_URL}/auth/account`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation }),
      });
      if (!response.ok) {
        setDeleteError(await responseError(response, "Could not delete your account."));
        return;
      }
      setUser(null);
      router.replace("/");
    } catch {
      setDeleteError("Can't reach the server right now. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="relative min-h-screen bg-[#f4f6fb] px-6 py-10 text-neutral-900 sm:px-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,_#94a3b8_1.3px,_transparent_1.4px)] bg-[length:24px_24px] opacity-50" />
      <div className="relative mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900">← Back home</Link>
          <span className="font-mono text-sm tracking-wide text-neutral-600">Account settings</span>
        </div>

        <h1 className="mt-12 text-3xl font-medium tracking-tight sm:text-4xl">Your account</h1>
        <p className="mt-2 text-sm text-neutral-600">Manage how you appear, your password, and your account data.</p>

        <div className="mt-10 space-y-6">
          <section className="border border-neutral-200 bg-white p-6 sm:p-8">
            <h2 className="text-lg font-medium">Profile</h2>
            <form onSubmit={handleProfile} className="mt-6 space-y-5">
              <label className="block text-sm font-medium" htmlFor="display-name">
                Display name
                <input id="display-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="name" className={inputClass} />
              </label>
              <label className="block text-sm font-medium" htmlFor="account-email">
                Email
                <input id="account-email" value={user.email} readOnly className={`${inputClass} cursor-not-allowed bg-neutral-100 text-neutral-500`} />
                <span className="mt-1.5 block text-xs font-normal text-neutral-500">Your sign-in email cannot be changed here.</span>
              </label>
              <div className="flex flex-wrap items-center gap-4">
                <button disabled={savingProfile || !name.trim()} className="bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60">
                  {savingProfile ? "Saving..." : "Save profile"}
                </button>
                <p aria-live="polite" className="text-sm text-neutral-600">{profileStatus}</p>
              </div>
            </form>
          </section>

          <section className="border border-neutral-200 bg-white p-6 sm:p-8">
            <h2 className="text-lg font-medium">Change password</h2>
            <p className="mt-1 text-sm text-neutral-500">Use at least 8 characters. Changing it signs out your other sessions.</p>
            <form onSubmit={handlePassword} className="mt-6 space-y-5">
              <label className="block text-sm font-medium" htmlFor="current-password">Current password<input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" className={inputClass} /></label>
              <label className="block text-sm font-medium" htmlFor="new-password">New password<input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} autoComplete="new-password" className={inputClass} /></label>
              <label className="block text-sm font-medium" htmlFor="confirm-password">Confirm new password<input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" className={inputClass} /></label>
              <div className="flex flex-wrap items-center gap-4">
                <button disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword} className="bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60">{changingPassword ? "Changing..." : "Change password"}</button>
                <p aria-live="polite" className="text-sm text-neutral-600">{passwordStatus}</p>
              </div>
            </form>
          </section>

          <section className="border border-red-200 bg-white p-6 sm:p-8">
            <h2 className="text-lg font-medium text-red-700">Delete account</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">This permanently deletes your account, every board you own, and everything drawn on those boards. It cannot be undone.</p>
            {!showDelete ? (
              <button type="button" onClick={() => setShowDelete(true)} className="mt-5 border border-red-600 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600">Start account deletion</button>
            ) : (
              <form onSubmit={handleDelete} className="mt-6 space-y-5 border-t border-red-100 pt-6">
                <label className="block text-sm font-medium" htmlFor="delete-password">Password<input id="delete-password" type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} autoComplete="current-password" className={inputClass} /></label>
                <label className="block text-sm font-medium" htmlFor="delete-confirmation">Type DELETE to confirm<input id="delete-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" spellCheck={false} className={inputClass} /></label>
                {deleteError && <p role="alert" className="text-sm text-red-600">{deleteError}</p>}
                <div className="flex gap-3">
                  <button type="button" disabled={deleting} onClick={() => { setShowDelete(false); setDeletePassword(""); setDeleteConfirmation(""); setDeleteError(null); }} className="px-4 py-2.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-60">Cancel</button>
                  <button disabled={deleting || !deletePassword || deleteConfirmation !== "DELETE"} className="bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-60">{deleting ? "Deleting..." : "Delete my account"}</button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
