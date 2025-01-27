type Metadata = {
    transaction_key: string;
    request_id: string;
    sha256: string;
    created: string; // ISO date string
    duration: number;
    channels: number;
    models: string[];
    model_info: Record<string, {
        name: string;
        version: string;
        arch: string;
    }>;
};

type Word = {
    word: string;
    start: number;
    end: number;
    confidence: number;
    speaker: number;
    speaker_confidence: number;
    punctuated_word: string;
};

type Sentence = {
    text: string;
    start: number;
    end: number;
};

export type Paragraph = {
    sentences: Sentence[];
    speaker: number;
    num_words: number;
    start: number;
    end: number;
};

type Alternative = {
    transcript: string;
    confidence: number;
    words: Word[];
    paragraphs: {
        transcript: string;
        paragraphs: Paragraph[];
    };
};

type Channel = {
    alternatives: Alternative[];
    detected_language: string;
    language_confidence: number;
};

export type Results = {
    channels: Channel[];
};

export type DataType = {
    metadata: Metadata;
    results: Results;
};
