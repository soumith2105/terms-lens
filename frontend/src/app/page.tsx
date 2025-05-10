// Final version: Submit question on Enter key press
"use client";
import { useState, useRef } from "react";
import axios from "axios";
import { marked } from "marked";

interface UserTypeBlock {
	userType: string;
	points: { title: string; items: string[] }[];
}

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:5000/";

export default function Home() {
	const [url, setUrl] = useState("");
	const [summary, setSummary] = useState("");
	const [userTypes, setUserTypes] = useState<UserTypeBlock[]>([]);
	const [notices, setNotices] = useState<string[]>([]);
	const [chatHistory, setChatHistory] = useState<
		{ question: string; answer: string }[]
	>([]);
	const [question, setQuestion] = useState("");
	const [context, setContext] = useState<unknown>(null);
	const [loading, setLoading] = useState(false);

	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	const handleSubmit = async () => {
		setLoading(true);
		const formData = new FormData();
		if (url) formData.append("url", url);

		try {
			console.log(`${BASE_URL}analyze`)
			const res = await axios.post(
				`${BASE_URL}analyze`,
				formData
			);
			const data = res.data;
			setSummary(data.summary);
			setUserTypes(data.userTypes || []);
			setNotices(data.importantNotices || []);
			setContext(data);
		} catch (err) {
			setSummary("Something went wrong.");
			setUserTypes([]);
			setNotices([]);
			console.error("Error:", err);
		}
		setLoading(false);
	};

	const handleAsk = async () => {
		if (!question.trim() || !context) return;
		const payload = { question, url };
		const res = await axios.post(`${BASE_URL}/ask`, payload);
		const answer = res.data.answer;
		setChatHistory((prev) => [...prev, { question, answer }]);
		setQuestion("");
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleAsk();
		}
	};

	const hasAnalyzed = !!summary;

	return (
		<main className="flex min-h-screen bg-gradient-to-br from-white via-slate-100 to-slate-200 text-black relative">
			{hasAnalyzed && (
				<div className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur shadow-md px-8 py-4 flex justify-between items-center">
					<h1 className="text-2xl font-bold tracking-tight">
						Terms Lens
					</h1>
					<div className="flex gap-4 items-center">
						<input
							type="text"
							placeholder="Paste API documentation URL..."
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							className="border border-gray-300 rounded-md p-2 w-[400px] bg-gray-50"
						/>
						<button
							onClick={handleSubmit}
							disabled={loading}
							className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2 rounded shadow-md transition"
						>
							{loading ? "Analyzing..." : "Submit"}
						</button>
					</div>
				</div>
			)}

			{!hasAnalyzed ? (
				<div className="flex flex-col justify-center items-center w-full h-screen">
					<h1 className="text-4xl font-bold mb-6 text-gray-800">
						Terms Lens
					</h1>
					<div className="flex gap-4">
						<input
							type="text"
							placeholder="Paste API documentation URL..."
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							className="border border-gray-300 rounded-md p-3 w-[400px] bg-white"
						/>
						<button
							onClick={handleSubmit}
							disabled={loading}
							className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded shadow-md transition"
						>
							{loading ? "Analyzing..." : "Submit"}
						</button>
					</div>
				</div>
			) : (
				<div className="flex w-full pt-[80px] h-screen overflow-hidden">
					{/* Left: Chat Interface */}
					<div className="w-[40%] p-6 bg-white border-r border-gray-300 overflow-y-auto animate-slideInLeft h-full relative">
						<h2 className="text-xl font-semibold mb-4">
							💬 Ask a Question
						</h2>
						<div className="flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-200px)] pr-1 h-full">
							{chatHistory.map((entry, idx) => (
								<div key={idx} className="space-y-2">
									<p className="text-sm font-medium text-blue-700">
										You: {entry.question}
									</p>
									<div className="text-sm text-gray-800 whitespace-pre-wrap">
										{entry.answer}
									</div>
								</div>
							))}
						</div>

						<div className="sticky bottom-0 mt-6 w-full">
							<div className="relative border border-gray-300 rounded-md bg-white p-3 shadow-sm">
								<textarea
									ref={textareaRef}
									rows={4}
									value={question}
									onChange={(e) =>
										setQuestion(e.target.value)
									}
									onKeyDown={handleKeyDown}
									placeholder="Ask something about the terms..."
									className="w-full resize-none bg-white outline-none pr-20 text-sm"
								/>
								<button
									onClick={handleAsk}
									className="absolute bottom-2 right-2 text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md shadow"
								>
									Send
								</button>
							</div>
						</div>
					</div>

					{/* Right: Summary + User Roles */}
					<div className="w-[60%] p-8 overflow-y-auto animate-slideInRight">
						{summary && (
							<section className="">
								<h2 className="text-xl font-semibold mb-3">
									🔍 Summary
								</h2>
								<div
									className="prose prose-neutral max-w-none"
									dangerouslySetInnerHTML={{
										__html: marked.parse(summary),
									}}
								/>
							</section>
						)}

						{userTypes.length > 0 && (
							<section className="w-full mt-6">
								<h2 className="text-xl font-semibold mb-4">
									👥 Rules for Different Kinds of Users
								</h2>
								{userTypes.map((user, idx) => (
									<div
										key={idx}
										className="bg-gray-100 border border-gray-300 p-5 mb-4 rounded-lg shadow-sm"
									>
										<h3 className="font-bold text-lg mb-2">
											{user.userType}
										</h3>
										{typeof user.points === "string" ? (
											<p className="text-sm text-gray-700">
												{user.points}
											</p>
										) : (
											<div className="space-y-4">
												{user.points.map((point, i) => (
													<div key={i}>
														<h4 className="font-semibold text-sm mb-1 text-gray-900">
															{point.title}
														</h4>
														{point.items &&
														point.items.length >
															0 ? (
															<ul className="list-disc list-outside pl-5 text-sm text-gray-800 space-y-1 marker:text-gray-600 leading-relaxed">
																{point.items.map(
																	(
																		item,
																		j
																	) => (
																		<li
																			key={
																				j
																			}
																		>
																			{
																				item
																			}
																		</li>
																	)
																)}
															</ul>
														) : (
															<p className="text-sm text-gray-500 italic">
																No details
																mentioned.
															</p>
														)}
													</div>
												))}
											</div>
										)}
									</div>
								))}
							</section>
						)}

						{notices.length > 0 && (
							<section className="bg-yellow-50 border-l-4 border-yellow-500 p-6 mt-6 rounded">
								<h2 className="text-xl font-semibold mb-3">
									⚠️ Important Notices
								</h2>
								<ul className="list-disc list-inside space-y-1 text-sm">
									{notices.map((n, i) => (
										<li key={i}>{n}</li>
									))}
								</ul>
							</section>
						)}
					</div>
				</div>
			)}
		</main>
	);
}
