"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface Alarm {
	id: string;
	name: string;
	description?: string;
	type: string;
	severity: string;
	status: string;
	isEnabled: boolean;
	triggerCount: number;
	lastTriggeredAt?: string;
	createdAt: string;
}

export default function AlarmsPage() {
	const params = useParams();
	const websiteId = params.websiteId as string;
	const [alarms, setAlarms] = useState<Alarm[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [showCreateModal, setShowCreateModal] = useState(false);

	useEffect(() => {
		fetchAlarms();
	}, [websiteId]);

	const fetchAlarms = async () => {
		try {
			setLoading(true);
			const response = await fetch(
				`/api/v1/alarms?websiteId=${websiteId}`,
				{
					credentials: "include",
				}
			);

			if (!response.ok) {
				throw new Error("Failed to fetch alarms");
			}

			const data = await response.json();
			if (data.success) {
				setAlarms(data.data.alarms);
			} else {
				setError(data.error || "Failed to load alarms");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setLoading(false);
		}
	};

	const getSeverityColor = (severity: string) => {
		switch (severity) {
			case "critical":
				return "bg-red-100 text-red-800 border-red-200";
			case "high":
				return "bg-orange-100 text-orange-800 border-orange-200";
			case "medium":
				return "bg-yellow-100 text-yellow-800 border-yellow-200";
			case "low":
				return "bg-blue-100 text-blue-800 border-blue-200";
			default:
				return "bg-gray-100 text-gray-800 border-gray-200";
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "active":
				return "bg-green-100 text-green-800 border-green-200";
			case "triggered":
				return "bg-red-100 text-red-800 border-red-200";
			case "paused":
				return "bg-gray-100 text-gray-800 border-gray-200";
			case "resolved":
				return "bg-blue-100 text-blue-800 border-blue-200";
			default:
				return "bg-gray-100 text-gray-800 border-gray-200";
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
					<p className="mt-4 text-gray-600">Loading alarms...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<div className="text-red-600 text-xl mb-4">⚠️</div>
					<p className="text-gray-800 font-semibold">Error loading alarms</p>
					<p className="text-gray-600 mt-2">{error}</p>
					<button
						onClick={fetchAlarms}
						className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
					>
						Retry
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="flex justify-between items-center mb-8">
				<div>
					<h1 className="text-3xl font-bold text-gray-900">Alarms</h1>
					<p className="text-gray-600 mt-2">
						Monitor and manage your website alarms
					</p>
				</div>
				<button
					onClick={() => setShowCreateModal(true)}
					className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm"
				>
					+ Create Alarm
				</button>
			</div>

			{alarms.length === 0 ? (
				<div className="text-center py-16 bg-white rounded-lg border border-gray-200">
					<div className="text-6xl mb-4">🔔</div>
					<h3 className="text-xl font-semibold text-gray-900 mb-2">
						No alarms configured
					</h3>
					<p className="text-gray-600 mb-6">
						Get started by creating your first alarm to monitor your website
					</p>
					<button
						onClick={() => setShowCreateModal(true)}
						className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
					>
						Create Your First Alarm
					</button>
				</div>
			) : (
				<div className="grid gap-6">
					{alarms.map((alarm) => (
						<div
							key={alarm.id}
							className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
						>
							<div className="flex justify-between items-start">
								<div className="flex-1">
									<div className="flex items-center gap-3 mb-2">
										<h3 className="text-xl font-semibold text-gray-900">
											{alarm.name}
										</h3>
										<span
											className={`px-3 py-1 rounded-full text-xs font-medium border ${getSeverityColor(
												alarm.severity
											)}`}
										>
											{alarm.severity.toUpperCase()}
										</span>
										<span
											className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
												alarm.status
											)}`}
										>
											{alarm.status.toUpperCase()}
										</span>
									</div>
									{alarm.description && (
										<p className="text-gray-600 mb-4">{alarm.description}</p>
									)}
									<div className="flex gap-6 text-sm text-gray-500">
										<div>
											<span className="font-medium">Type:</span>{" "}
											{alarm.type.replace(/_/g, " ")}
										</div>
										<div>
											<span className="font-medium">Triggers:</span>{" "}
											{alarm.triggerCount}
										</div>
										{alarm.lastTriggeredAt && (
											<div>
												<span className="font-medium">Last Triggered:</span>{" "}
												{new Date(alarm.lastTriggeredAt).toLocaleString()}
											</div>
										)}
									</div>
								</div>
								<div className="flex gap-2">
									<button
										className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg font-medium"
										onClick={() => {
											/* TODO: Implement edit */
										}}
									>
										Edit
									</button>
									<button
										className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium"
										onClick={() => {
											/* TODO: Implement delete */
										}}
									>
										Delete
									</button>
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			{/* Create Alarm Modal - Placeholder */}
			{showCreateModal && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
					<div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4">
						<h2 className="text-2xl font-bold mb-4">Create New Alarm</h2>
						<p className="text-gray-600 mb-6">
							Alarm creation form will be implemented here
						</p>
						<div className="flex justify-end gap-3">
							<button
								onClick={() => setShowCreateModal(false)}
								className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium"
							>
								Cancel
							</button>
							<button
								onClick={() => {
									/* TODO: Implement create */
									setShowCreateModal(false);
								}}
								className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
							>
								Create Alarm
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
